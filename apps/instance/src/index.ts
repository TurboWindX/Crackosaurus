import { type ChildProcess } from "child_process";
import process from "node:process";

import { STATUS } from "@repo/api";
import {
  CLUSTER_FILESYSTEM_TYPE,
  getInstanceFolderJobs,
  getInstanceMetadata,
  getJobHashPath,
  getJobMetadata,
  getJobOutputPath,
  watchInstanceFolder,
  writeInstanceMetadata,
  writeJobMetadata,
} from "@repo/filesystem/cluster";
import { getWordlistPath } from "@repo/filesystem/wordlist";
import { hashcat } from "@repo/hashcat/exe";

import config from "./config";

const INTERVAL_MS = 1000;
const COOLDOWN_SEC = 15;

async function main() {
  let instanceMetadata = getInstanceMetadata(
    config.instanceRoot,
    config.instanceID
  );
  if (instanceMetadata.status === STATUS.Stopped) process.exit(0);
  else if (instanceMetadata.status === STATUS.Error) process.exit(1);
  else if (instanceMetadata.status === STATUS.Pending) {
    instanceMetadata.status = STATUS.Running;

    writeInstanceMetadata(
      config.instanceRoot,
      config.instanceID,
      instanceMetadata
    );
  }

  let jobID: string | null = null;
  let jobProcess: ChildProcess | null = null;
  let jobQueue: string[] = getInstanceFolderJobs(
    config.instanceRoot,
    config.instanceID
  ).filter((jobID) => {
    const metadata = getJobMetadata(
      config.instanceRoot,
      config.instanceID,
      jobID
    );

    if (
      metadata.status === STATUS.Complete ||
      metadata.status === STATUS.Stopped
    )
      return false;

    metadata.status = STATUS.Pending;
    writeJobMetadata(config.instanceRoot, config.instanceID, jobID, metadata);

    return true;
  });

  watchInstanceFolder(config.instanceRoot, config.instanceID, (event) => {
    if (event.type === CLUSTER_FILESYSTEM_TYPE.InstanceUpdate) {
      instanceMetadata = event.metadata;

      if (instanceMetadata.status === STATUS.Stopped) process.exit(0);
      else if (instanceMetadata.status === STATUS.Error) process.exit(1);
    } else if (event.type === CLUSTER_FILESYSTEM_TYPE.JobUpdate) {
      const metadata = event.metadata.status;
      if (metadata === STATUS.Pending) {
        if (jobQueue.findIndex((jID) => jID === event.jobID) == -1) {
          jobQueue.push(event.jobID);
        }
      } else if (metadata === STATUS.Stopped) {
        if (jobID === event.jobID) {
          console.log(`[Instance ${config.instanceID}] [Job ${jobID}] Stopped`);

          jobProcess?.kill();
          jobProcess = null;
          jobID = null;
        } else {
          jobQueue = jobQueue.filter((jID) => jID !== jobID);
        }
      }
    }
  });

  let cooldown = 0;
  setInterval(() => {
    if (jobID === null) {
      const nextJobID = jobQueue.shift();
      if (nextJobID === undefined) {
        if (cooldown++ > COOLDOWN_SEC) {
          instanceMetadata.status = STATUS.Pending;
          writeInstanceMetadata(
            config.instanceRoot,
            config.instanceID,
            instanceMetadata
          );

          console.log(`[Instance ${config.instanceID}] Cooldown`);

          process.exit(0);
        }

        return;
      } else {
        cooldown = 0;
      }

      jobID = nextJobID;
    }

    if (jobProcess === null) {
      const jobMetadata = getJobMetadata(
        config.instanceRoot,
        config.instanceID,
        jobID
      );

      if (jobMetadata.status !== STATUS.Pending) {
        jobID = null;
        return;
      }

      jobMetadata.status = STATUS.Running;

      console.log(`[Instance ${config.instanceID}] [Job ${jobID}] Started`);

      writeJobMetadata(
        config.instanceRoot,
        config.instanceID,
        jobID,
        jobMetadata
      );

      jobProcess = hashcat({
        exePath: config.hashcatPath,
        inputFile: getJobHashPath(
          config.instanceRoot,
          config.instanceID,
          jobID
        ),
        outputFile: getJobOutputPath(
          config.instanceRoot,
          config.instanceID,
          jobID
        ),
        hashType: jobMetadata.hashType,
        wordlistFile: getWordlistPath(
          config.wordlistRoot,
          jobMetadata.wordlist
        ),
      });
    } else if (jobProcess.exitCode !== null) {
      const jobMetadata = getJobMetadata(
        config.instanceRoot,
        config.instanceID,
        jobID
      );

      if (jobProcess.exitCode === 0) jobMetadata.status = STATUS.Complete;
      else jobMetadata.status = STATUS.Error;

      console.log(
        `[Instance ${config.instanceID}] [Job ${jobID}] Exit with code ${jobProcess.exitCode}`
      );

      writeJobMetadata(
        config.instanceRoot,
        config.instanceID,
        jobID,
        jobMetadata
      );

      jobProcess = null;
      jobID = null;
    }
  }, INTERVAL_MS);

  console.log(`[Instance ${config.instanceID}] Started`);
}

if (require.main === module) main();
