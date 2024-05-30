import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { ClusterStatus, STATUS } from "@repo/api";
import { HASH_TYPES, HashType } from "@repo/hashcat/data";
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
  hashType: z.enum([...HASH_TYPES]),
  wordlist: z.string(),
});
export type JobMetadata = z.infer<typeof JOB_METADATA>;

const UNKNOWN_JOB_METADATA: JobMetadata = {
  status: STATUS.Unknown,
  hashType: "NTLM",
  wordlist: "",
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
    jobID: z.string(),
    metadata: JOB_METADATA,
  }),
  z.object({
    type: z.literal(CLUSTER_FILESYSTEM_TYPE.InstanceUpdate),
    instanceID: z.string(),
    metadata: INSTANCE_METADATA,
  }),
]);
export type ClusterFileSystemEvent = z.infer<typeof CLUSTER_FILESYSTEM_EVENT>;

async function safeReadFileAsync(filePath: string): Promise<string> {
  const lockFile = filePath + ".lock";

  await new Promise<void>((resolve) => {
    let interval = setInterval(() => {
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

async function safeWriteFileAsync(
  filePath: string,
  data: string
): Promise<void> {
  const lockFile = filePath + ".lock";

  await new Promise<void>((resolve) => {
    let interval = setInterval(() => {
      if (!fs.existsSync(lockFile)) {
        fs.writeFileSync(lockFile, "");
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  await new Promise<void>((resolve, reject) =>
    fs.writeFile(filePath, data, {}, (err) => {
      if (err) reject(err);
      resolve();
    })
  );

  fs.rmSync(lockFile);
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
  callback: (event: ClusterFileSystemEvent) => any
): fs.FSWatcher {
  const instancePath = path.join(instanceRoot, instanceID);

  const instanceMetadata = path.resolve(path.join(instancePath, METADATA_FILE));

  return fs.watch(
    instancePath,
    { recursive: true },
    async (event, filename) => {
      const filePath = path.join(instancePath, filename ?? "/");

      if (!fs.existsSync(filePath)) return;

      if (filePath === instanceMetadata) {
        callback({
          type: CLUSTER_FILESYSTEM_TYPE.InstanceUpdate,
          instanceID: instanceID,
          metadata: await getInstanceMetadata(instanceRoot, instanceID),
        });
      } else if (filePath.endsWith(METADATA_FILE)) {
        const jobID = path.basename(path.dirname(filePath));

        callback({
          type: CLUSTER_FILESYSTEM_TYPE.JobUpdate,
          jobID: jobID,
          metadata: await getJobMetadata(instanceRoot, instanceID, jobID),
        });
      }
    }
  );
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

  await safeWriteFileAsync(metadataFile, JSON.stringify(metadata));
}

export async function createInstanceFolder(
  instanceRoot: string,
  instanceID: string,
  props: {
    type: string;
  }
): Promise<void> {
  const instancePath = path.join(instanceRoot, instanceID);

  fs.mkdirSync(instancePath, { recursive: true });

  fs.mkdirSync(path.join(instancePath, JOBS_FOLDER));

  await safeWriteFileAsync(
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

  fs.writeFileSync(metadataFile, JSON.stringify(metadata));
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

  if (!fs.existsSync(metadataFile)) return UNKNOWN_JOB_METADATA;

  return JOB_METADATA.parse(JSON.parse(await safeReadFileAsync(metadataFile)));
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
  props: { hashType: HashType; hashes: string[]; wordlist: string }
): Promise<void> {
  const jobPath = path.join(instanceRoot, instanceID, JOBS_FOLDER, jobID);

  fs.mkdirSync(jobPath, { recursive: true });

  fs.writeFileSync(path.join(jobPath, HASHES_FILE), props.hashes.join("\n"));

  fs.writeFileSync(
    path.join(jobPath, METADATA_FILE),
    JSON.stringify(
      JOB_METADATA.parse({
        status: STATUS.Pending,
        hashType: props.hashType,
        wordlist: props.wordlist,
      })
    )
  );
}

export async function deleteJobFolder(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): Promise<void> {
  fs.rmdirSync(path.join(instanceRoot, instanceID, jobID), { recursive: true });
}
