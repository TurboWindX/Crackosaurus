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

export function getClusterFolderStatus(instanceRoot: string): ClusterStatus {
  if (!fs.existsSync(instanceRoot))
    return {
      instances: {},
    };

  return {
    instances: Object.fromEntries(
      getClusterFolderInstances(instanceRoot).map((instanceID) => {
        const instanceMetadata = getInstanceMetadata(instanceRoot, instanceID);

        return [
          instanceID,
          {
            status: instanceMetadata.status,
            jobs: Object.fromEntries(
              getInstanceFolderJobs(instanceRoot, instanceID).map((jobID) => {
                const jobMetadata = getJobMetadata(
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
              })
            ),
          },
        ];
      })
    ),
  };
}

export function createClusterFolder(instanceRoot: string): void {
  if (fs.existsSync(instanceRoot)) return;

  fs.mkdirSync(instanceRoot, { recursive: true });
}

export function getClusterFolderInstances(instanceRoot: string): string[] {
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

  return fs.watch(instancePath, { recursive: true }, (event, filename) => {
    const filePath = path.join(instancePath, filename ?? "/");

    if (!fs.existsSync(filePath)) return;

    if (filePath === instanceMetadata) {
      callback({
        type: CLUSTER_FILESYSTEM_TYPE.InstanceUpdate,
        instanceID: instanceID,
        metadata: getInstanceMetadata(instanceRoot, instanceID),
      });
    } else if (filePath.endsWith(METADATA_FILE)) {
      const jobID = path.basename(path.dirname(filePath));

      callback({
        type: CLUSTER_FILESYSTEM_TYPE.JobUpdate,
        jobID: jobID,
        metadata: getJobMetadata(instanceRoot, instanceID, jobID),
      });
    }
  });
}

export function getInstanceMetadata(
  instanceRoot: string,
  instanceID: string
): InstanceMetadata {
  const metadataFile = path.join(instanceRoot, instanceID, METADATA_FILE);

  if (!fs.existsSync(metadataFile)) return UNKNOWN_INSTANCE_METADATA;

  return INSTANCE_METADATA.parse(
    JSON.parse(fs.readFileSync(metadataFile, { encoding: "utf-8" }))
  );
}

export function writeInstanceMetadata(
  instanceRoot: string,
  instanceID: string,
  metadata: InstanceMetadata
): void {
  const metadataFile = path.join(instanceRoot, instanceID, METADATA_FILE);

  fs.writeFileSync(metadataFile, JSON.stringify(metadata));
}

export function createInstanceFolder(
  instanceRoot: string,
  instanceID: string,
  props: {
    type: string;
  }
): void {
  const instancePath = path.join(instanceRoot, instanceID);

  fs.mkdirSync(instancePath, { recursive: true });

  fs.mkdirSync(path.join(instancePath, JOBS_FOLDER));

  fs.writeFileSync(
    path.join(instancePath, METADATA_FILE),
    JSON.stringify(
      INSTANCE_METADATA.parse({
        status: STATUS.Pending,
        type: props.type,
      })
    )
  );
}

export function deleteInstanceFolder(
  instanceRoot: string,
  instanceID: string
): void {
  fs.rmdirSync(path.join(instanceRoot, instanceID), { recursive: true });
}

export function getInstanceFolderJobs(
  instanceRoot: string,
  instanceID: string
): string[] {
  const jobsPath = path.join(instanceRoot, instanceID, JOBS_FOLDER);

  return fs
    .readdirSync(jobsPath, { withFileTypes: true })
    .filter((f) => f.isDirectory())
    .map((f) => f.name);
}

export function writeJobMetadata(
  instanceRoot: string,
  instanceID: string,
  jobID: string,
  metadata: JobMetadata
): void {
  const metadataFile = path.join(
    instanceRoot,
    instanceID,
    JOBS_FOLDER,
    jobID,
    METADATA_FILE
  );

  fs.writeFileSync(metadataFile, JSON.stringify(metadata));
}

export function getJobMetadata(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): JobMetadata {
  const metadataFile = path.join(
    instanceRoot,
    instanceID,
    JOBS_FOLDER,
    jobID,
    METADATA_FILE
  );

  if (!fs.existsSync(metadataFile)) return UNKNOWN_JOB_METADATA;

  return JOB_METADATA.parse(
    JSON.parse(fs.readFileSync(metadataFile, { encoding: "utf-8" }))
  );
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

export function createJobFolder(
  instanceRoot: string,
  instanceID: string,
  jobID: string,
  props: { hashType: HashType; hashes: string[]; wordlist: string }
): void {
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

export function deleteJobFolder(
  instanceRoot: string,
  instanceID: string,
  jobID: string
): void {
  fs.rmdirSync(path.join(instanceRoot, instanceID, jobID), { recursive: true });
}
