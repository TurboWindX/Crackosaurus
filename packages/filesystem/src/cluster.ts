import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";

import { ClusterStatus, STATUS } from "@repo/api";
import { HASH_TYPES } from "@repo/hashcat/data";
import { readHashcatPot } from "@repo/hashcat/exe";

export const INSTANCE_METADATA = z.object({
  status: z.enum([
    STATUS.Pending,
    STATUS.Running,
    STATUS.Stopped,
    STATUS.Error,
    STATUS.Unknown,
  ]),
  type: z.string(),
  ec2InstanceId: z.string().optional(), // AWS EC2 instance ID for termination
});
export type InstanceMetadata = z.infer<typeof INSTANCE_METADATA>;

const UNKNOWN_INSTANCE_METADATA: InstanceMetadata = {
  status: STATUS.Unknown,
  type: "UNKNOWN",
};

export const JOB_METADATA = z.object({
  status: z.enum([
    STATUS.Pending,
    STATUS.Running,
    STATUS.Complete,
    STATUS.Stopped,
    STATUS.Error,
    STATUS.Unknown,
  ]),
  hashType: z.number().int().min(0),
  wordlist: z.string(),
  rule: z.string().optional(),
  instanceType: z.string().optional(), // Required instance type for this job
});
export type JobMetadata = z.infer<typeof JOB_METADATA>;

const UNKNOWN_JOB_METADATA: JobMetadata = {
  status: STATUS.Unknown,
  hashType: HASH_TYPES.plaintext,
  wordlist: "",
  rule: undefined,
};

const JOBS_FOLDER = "jobs";
const METADATA_FILE = "metadata.json";
const HASHES_FILE = "hashes.txt";
const OUTPUT_FILE = "output.pot";

export const CLUSTER_FILESYSTEM_TYPES = [
  "job_update",
  "instance_update",
] as const;

export const CLUSTER_FILESYSTEM_TYPE = {
  JobUpdate: CLUSTER_FILESYSTEM_TYPES[0],
  InstanceUpdate: CLUSTER_FILESYSTEM_TYPES[1],
} as const;

export const CLUSTER_FILESYSTEM_EVENT = z.union([
  z.object({
    type: z.literal(CLUSTER_FILESYSTEM_TYPE.JobUpdate),
    instanceID: z.string(),
    jobID: z.string(),
  }),
  z.object({
    type: z.literal(CLUSTER_FILESYSTEM_TYPE.InstanceUpdate),
    instanceID: z.string(),
  }),
]);
export type ClusterFileSystemEvent = z.infer<typeof CLUSTER_FILESYSTEM_EVENT>;

async function safeReadFileAsync(filePath: string): Promise<string> {
  const lockFile = filePath + ".lock";

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (!fs.existsSync(lockFile)) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  const data = await new Promise<string>((resolve, reject) =>
    fs.readFile(filePath, { encoding: "utf-8" }, (err, data) => {
      if (err) reject(err);
      resolve(data);
    })
  );

  return data;
}

/**
 * Atomic write helper that writes to a temp file in the same directory,
 * fsyncs the file, renames it into place, and fsyncs the parent directory.
 * This reduces the chance of readers seeing partially-written files on
 * network filesystems like EFS.
 */
async function atomicWriteFileAsync(
  filePath: string,
  data: string
): Promise<void> {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  // Temp filename in same directory
  const tmpName = path.join(dir, `.tmp-${crypto.randomUUID()}.tmp`);

  try {
    // Write file fully to temp path
    fs.writeFileSync(tmpName, data, { encoding: "utf-8" });

    // Ensure file contents are flushed to disk
    const fd = fs.openSync(tmpName, "r+");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Atomically rename into place
    fs.renameSync(tmpName, filePath);

    // Fsync parent directory so the rename is durable
    const dirFd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch (err) {
    // Cleanup temp file if present
    try {
      if (fs.existsSync(tmpName)) fs.rmSync(tmpName);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export async function getClusterFolderStatus(
  instanceRoot: string
): Promise<ClusterStatus> {
  if (!fs.existsSync(instanceRoot))
    return {
      instances: {},
    };

  return {
    instances: Object.fromEntries(
      await Promise.all(
        (await getClusterFolderInstances(instanceRoot)).map(
          async (instanceID) => {
            const instanceMetadata = await getInstanceMetadata(
              instanceRoot,
              instanceID
            );

            return [
              instanceID,
              {
                status: instanceMetadata.status,
                jobs: Object.fromEntries(
                  await Promise.all(
                    (await getInstanceFolderJobs(instanceRoot, instanceID)).map(
                      async (jobID) => {
                        const jobMetadata = await getJobMetadata(
                          instanceRoot,
                          instanceID,
                          jobID
                        );

                        const jobOutput = path.join(
                          instanceRoot,
                          instanceID,
                          JOBS_FOLDER,
                          jobID,
                          OUTPUT_FILE
                        );

                        let hashes = {};
                        if (fs.existsSync(jobOutput)) {
                          hashes = readHashcatPot(jobOutput);
                        }

                        return [
                          jobID,
                          {
                            status: jobMetadata.status,
                            hashes,
                          },
                        ];
                      }
                    )
                  )
                ),
              },
            ];
          }
        )
      )
    ),
  };
}

export async function createClusterFolder(instanceRoot: string): Promise<void> {
  if (fs.existsSync(instanceRoot)) return;

  fs.mkdirSync(instanceRoot, { recursive: true });
}

export async function getClusterFolderInstances(
  instanceRoot: string
): Promise<string[]> {
  return fs
    .readdirSync(instanceRoot, { withFileTypes: true })
    .filter((f) => f.isDirectory())
    .map((f) => f.name);
}

export function watchInstanceFolder(
  instanceRoot: string,
  instanceID: string,
  rateMs: number,
  callback: (event: ClusterFileSystemEvent) => unknown
): NodeJS.Timeout {
  const instancePath = path.join(instanceRoot, instanceID);

  const instanceMetadata = path.resolve(path.join(instancePath, METADATA_FILE));

  let lastModified = Date.now();

  const interval = setInterval(async () => {
    console.log(`[Watcher] Polling ${instancePath}`);

    if (fs.existsSync(instanceMetadata)) {
      const instanceStat = fs.statSync(instanceMetadata);
      if (instanceStat.mtimeMs >= lastModified) {
        console.log(`[Watcher] Instance metadata changed`);
        callback({
          type: CLUSTER_FILESYSTEM_TYPE.InstanceUpdate,
          instanceID,
        });
      }
    } else {
      console.log(
        `[Watcher] Instance metadata not found at ${instanceMetadata}`
      );
    }

    const jobsPath = path.join(instancePath, JOBS_FOLDER);
    console.log(`[Watcher] Checking jobs path: ${jobsPath}`);
    if (fs.existsSync(jobsPath)) {
      const jobs = fs.readdirSync(jobsPath);
      console.log(`[Watcher] Found ${jobs.length} job folders:`, jobs);
      for (const jobID of jobs) {
        const jobMetadata = path.join(jobsPath, jobID, METADATA_FILE);

        if (!fs.existsSync(jobMetadata)) {
          console.log(`[Watcher] Job ${jobID} metadata not found, skipping`);
          continue;
        }

        console.log(`[Watcher] Sending JobUpdate for ${jobID}`);
        callback({
          type: CLUSTER_FILESYSTEM_TYPE.JobUpdate,
          instanceID,
          jobID,
        });
      }
    } else {
      console.log(`[Watcher] Jobs path does not exist: ${jobsPath}`);
    }

    lastModified = Date.now();
  }, rateMs);

  return interval;
}

export async function getInstanceMetadata(
  instanceRoot: string,
  instanceID: string
): Promise<InstanceMetadata> {
  const metadataFile = path.join(instanceRoot, instanceID, METADATA_FILE);

  if (!fs.existsSync(metadataFile)) return UNKNOWN_INSTANCE_METADATA;

  return INSTANCE_METADATA.parse(
    JSON.parse(await safeReadFileAsync(metadataFile))
  );
}

export async function writeInstanceMetadata(
  instanceRoot: string,
  instanceID: string,
  metadata: InstanceMetadata
): Promise<void> {
  const metadataFile = path.join(instanceRoot, instanceID, METADATA_FILE);

  console.log(
    `[writeInstanceMetadata] Writing metadata for instance ${instanceID} to ${metadataFile}`
  );
  console.log(
    `[writeInstanceMetadata] Metadata contents: ${JSON.stringify(metadata)}`
  );

  await atomicWriteFileAsync(metadataFile, JSON.stringify(metadata));

  // Attempt to read back the file to verify visibility/consistency
  try {
    const raw = await safeReadFileAsync(metadataFile);
    console.log(
      `[writeInstanceMetadata] Verified metadata file for instance ${instanceID}: ${raw}`
    );
  } catch (err) {
    console.warn(
      `[writeInstanceMetadata] Failed to verify metadata file for instance ${instanceID}:`,
      err
    );
  }
}

export async function createInstanceFolder(
  instanceRoot: string,
  instanceID: string,
  props: {
    type: string;
  }
): Promise<void> {
  const instancePath = path.join(instanceRoot, instanceID);

  // Log the intended path so we can later verify it is on EFS and not
  // the container's ephemeral filesystem.
  console.log(`[filesystem] Creating instance folder at: ${instancePath}`);

  // Best-effort check: if /proc/mounts exists, look for common EFS mount
  // markers to detect whether instanceRoot is mounted from a remote FS.
  try {
    if (fs.existsSync("/proc/mounts")) {
      const mounts = fs.readFileSync("/proc/mounts", "utf8");
      console.log(`[filesystem] Full /proc/mounts for debugging:\n${mounts}`);
      
      const isOnMountedFs = mounts.split("\n").some((line) => {
        // Look for the instanceRoot or common efs mount points in mounts
        return line.includes(instanceRoot) || line.includes("/crackodata") || line.includes("/mnt/efs") || line.includes("efs");
      });
      if (!isOnMountedFs) {
        console.warn(
          `[filesystem] Warning: target instanceRoot (${instanceRoot}) does not appear in /proc/mounts. ` +
            "This can mean the process will write to a container-local filesystem instead of EFS."
        );
      } else {
        console.log(`[filesystem] Confirmed instanceRoot (${instanceRoot}) is on a mounted filesystem`);
      }
    }
  } catch (e) {
    // Don't fail on best-effort check
    console.error(`[filesystem] Failed to inspect /proc/mounts:`, e);
  }

  fs.mkdirSync(instancePath, { recursive: true });
  fs.mkdirSync(path.join(instancePath, JOBS_FOLDER));

  await atomicWriteFileAsync(
    path.join(instancePath, METADATA_FILE),
    JSON.stringify(
      INSTANCE_METADATA.parse({
        status: STATUS.Pending,
        type: props.type,
      })
    )
  );
}

export async function deleteInstanceFolder(
  instanceRoot: string,
  instanceID: string
): Promise<void> {
  fs.rmdirSync(path.join(instanceRoot, instanceID), { recursive: true });
}

export async function getInstanceFolderJobs(
  instanceRoot: string,
  instanceID: string
): Promise<string[]> {
  const jobsPath = path.join(instanceRoot, instanceID, JOBS_FOLDER);

  return fs
    .readdirSync(jobsPath, { withFileTypes: true })
    .filter((f) => f.isDirectory())
    .map((f) => f.name);
}

export async function writeJobMetadata(
  instanceRoot: string,
  instanceID: string,
  jobID: string,
  metadata: JobMetadata
): Promise<void> {
  const metadataFile = path.join(
    instanceRoot,
    instanceID,
    JOBS_FOLDER,
    jobID,
    METADATA_FILE
  );

  console.log(
    `[writeJobMetadata] Writing metadata for job ${jobID} at ${metadataFile}`
  );
  console.log(
    `[writeJobMetadata] Metadata contents:`,
    JSON.stringify(metadata)
  );
  await atomicWriteFileAsync(metadataFile, JSON.stringify(metadata));
}

export async function getJobMetadata(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): Promise<JobMetadata> {
  const metadataFile = path.join(
    instanceRoot,
    instanceID,
    JOBS_FOLDER,
    jobID,
    METADATA_FILE
  );

  if (!fs.existsSync(metadataFile)) {
    // Metadata file missing - this is expected for external/unknown jobs
    return UNKNOWN_JOB_METADATA;
  }
  const raw = await safeReadFileAsync(metadataFile);
  return JOB_METADATA.parse(JSON.parse(raw));
}

/**
 * Cleanup `.tmp-*` files recursively under the given root. Returns the number
 * of files removed.
 */
export async function cleanupTempFiles(
  root: string,
  /** max age in milliseconds; defaults to 30 minutes */
  maxAgeMs = 30 * 60 * 1000
): Promise<number> {
  if (!fs.existsSync(root)) return 0;

  let removed = 0;

  const now = Date.now();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile()) {
        if (entry.name.startsWith(".tmp-")) {
          try {
            const stat = fs.statSync(p);
            if (now - stat.mtimeMs > maxAgeMs) {
              fs.rmSync(p);
              removed++;
            }
          } catch {
            // ignore per-file errors
          }
        }
      }
    }
  }

  try {
    walk(root);
  } catch {
    // ignore overall errors
  }

  return removed;
}

/**
 * Schedule periodic cleanup of `.tmp-*` files under root. Returns the
 * interval handle so callers can clear it when needed.
 */
export function scheduleTempFileCleanup(
  root: string,
  intervalMs = 10 * 60 * 1000,
  maxAgeMs = 10 * 60 * 1000
): NodeJS.Timeout {
  // Run once immediately
  void cleanupTempFiles(root, maxAgeMs);

  return setInterval(() => {
    void cleanupTempFiles(root, maxAgeMs).catch(() => {
      /* swallow errors */
    });
  }, intervalMs);
}

export function getJobHashPath(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): string {
  return path.resolve(
    path.join(instanceRoot, instanceID, JOBS_FOLDER, jobID, HASHES_FILE)
  );
}

export function getJobOutputPath(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): string {
  return path.resolve(
    path.join(instanceRoot, instanceID, JOBS_FOLDER, jobID, OUTPUT_FILE)
  );
}

export async function createJobFolder(
  instanceRoot: string,
  instanceID: string,
  jobID: string,
  props: {
    hashType: number;
    hashes: string[];
    wordlist: string;
    rule?: string;
    instanceType?: string;
  }
): Promise<void> {
  const jobsDir = path.join(instanceRoot, instanceID, JOBS_FOLDER);
  const jobPath = path.join(jobsDir, jobID);

  // Create a temporary folder and write all job files there first. Then
  // atomically rename the folder into place. This reduces the chance that
  // a remote NFS client will observe a partially-written job folder and
  // addresses EFS propagation edge cases without requiring SQS.
  const tempJobPath = `${jobPath}.tmp-${crypto.randomUUID()}`;

  try {
    fs.mkdirSync(tempJobPath, { recursive: true });

    // Write hashes file
    fs.writeFileSync(
      path.join(tempJobPath, HASHES_FILE),
      props.hashes.join("\n")
    );

    // Prepare metadata and write
    const metadataObj = JOB_METADATA.parse({
      status: STATUS.Pending,
      hashType: props.hashType,
      wordlist: props.wordlist,
      rule: props.rule,
      instanceType: props.instanceType,
    });
    const metadataPath = path.join(tempJobPath, METADATA_FILE);
    fs.writeFileSync(metadataPath, JSON.stringify(metadataObj));
    console.log(
      `[createJobFolder] Wrote metadata for job ${jobID} at ${metadataPath}`
    );

    // fsync metadata file to flush contents to storage
    try {
      const fd = fs.openSync(metadataPath, "r+");
      try {
        fs.fsyncSync(fd);
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error(
        `[createJobFolder] Error fsync'ing metadata for job ${jobID}:`,
        err
      );
    }

    // Atomically rename into place
    try {
      // Ensure parent jobs directory exists
      fs.mkdirSync(jobsDir, { recursive: true });
      fs.renameSync(tempJobPath, jobPath);

      // fsync the jobs directory so directory entry is persisted
      try {
        const dirFd = fs.openSync(jobsDir, "r");
        try {
          fs.fsyncSync(dirFd);
        } finally {
          try {
            fs.closeSync(dirFd);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.error(
          `[createJobFolder] Error fsync'ing jobs dir for job ${jobID}:`,
          err
        );
      }

      console.log(
        `[createJobFolder] Atomically created job folder for ${jobID} at ${jobPath}`
      );
    } catch (err) {
      // Attempt cleanup of temp folder on failure
      try {
        if (fs.existsSync(tempJobPath))
          fs.rmdirSync(tempJobPath, { recursive: true });
      } catch (cleanupErr) {
        console.error(
          `[createJobFolder] Failed to cleanup temp job folder ${tempJobPath}:`,
          cleanupErr
        );
      }
      throw err;
    }
  } catch (err) {
    console.error(
      `[createJobFolder] Failed to create job folder for ${jobID}:`,
      err
    );
    throw err;
  }
}

export async function deleteJobFolder(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): Promise<void> {
  const jobFolder = path.join(instanceRoot, instanceID, jobID);

  if (fs.existsSync(jobFolder)) fs.rmdirSync(jobFolder, { recursive: true });
}

export async function writeWordlistFile(
  wordlistRoot: string,
  wordlistID: string,
  data: Buffer
): Promise<void> {
  const wordlistFile = path.join(wordlistRoot, wordlistID);

  fs.writeFileSync(wordlistFile, data as Uint8Array);
}

export async function writeWordlistFileFromStream(
  wordlistRoot: string,
  wordlistID: string,
  stream: NodeJS.ReadableStream
): Promise<void> {
  const wordlistFile = path.join(wordlistRoot, wordlistID);
  const writeStream = fs.createWriteStream(wordlistFile);

  return new Promise((resolve, reject) => {
    // Use pipeline for better error handling
    stream.pipe(writeStream);

    writeStream.on("finish", () => {
      console.log(`[writeWordlistFileFromStream] completed: ${wordlistID}`);
      resolve();
    });

    writeStream.on("error", (err) => {
      console.error(
        `[writeWordlistFileFromStream] write error: ${err.message}`
      );
      reject(err);
    });

    stream.on("error", (err) => {
      console.error(
        `[writeWordlistFileFromStream] stream error: ${err.message}`
      );
      writeStream.destroy();
      reject(err);
    });
  });
}

export async function deleteWordlistFile(
  wordlistRoot: string,
  wordlistID: string
): Promise<void> {
  const wordlistFile = path.join(wordlistRoot, wordlistID);

  if (fs.existsSync(wordlistFile)) fs.rmSync(wordlistFile);
}

// Rules helpers (mirror wordlist helpers). Rules are stored on EFS like
// wordlists so the instances can fetch them by path rather than storing
// the rule contents in the DB.
export async function writeRuleFile(
  ruleRoot: string,
  ruleID: string,
  data: Buffer
): Promise<void> {
  const ruleFile = path.join(ruleRoot, ruleID);

  fs.writeFileSync(ruleFile, data as Uint8Array);
}

export async function writeRuleFileFromStream(
  ruleRoot: string,
  ruleID: string,
  stream: NodeJS.ReadableStream
): Promise<void> {
  const ruleFile = path.join(ruleRoot, ruleID);
  const writeStream = fs.createWriteStream(ruleFile);

  return new Promise((resolve, reject) => {
    stream.pipe(writeStream);

    writeStream.on("finish", () => {
      console.log(`[writeRuleFileFromStream] completed: ${ruleID}`);
      resolve();
    });

    writeStream.on("error", (err) => {
      console.error(`[writeRuleFileFromStream] write error: ${err.message}`);
      reject(err);
    });

    stream.on("error", (err) => {
      console.error(`[writeRuleFileFromStream] stream error: ${err.message}`);
      writeStream.destroy();
      reject(err);
    });
  });
}

export async function deleteRuleFile(
  ruleRoot: string,
  ruleID: string
): Promise<void> {
  const ruleFile = path.join(ruleRoot, ruleID);

  if (fs.existsSync(ruleFile)) fs.rmSync(ruleFile);
}
