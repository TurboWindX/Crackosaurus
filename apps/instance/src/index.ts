import { type ChildProcess } from "child_process";
import process from "node:process";

import { STATUS } from "@repo/api";
import {
  CLUSTER_FILESYSTEM_TYPE,
  ClusterFileSystemEvent,
  createInstanceFolder,
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

const EXIT_CASES = [0, 1, 2] as const;
type ExitCase = (typeof EXIT_CASES)[number];

const EXIT_CASE = {
  Stop: EXIT_CASES[0],
  Error: EXIT_CASES[1],
  Cooldown: EXIT_CASES[2],
} as const;

function innerMain(): Promise<ExitCase> {
  return new Promise(async (resolve) => {
    let instanceMetadata = await getInstanceMetadata(
      config.instanceRoot,
      config.instanceID
    );
    if (instanceMetadata.status === STATUS.Stopped) resolve(EXIT_CASE.Stop);
    else if (instanceMetadata.status === STATUS.Pending) {
      instanceMetadata.status = STATUS.Running;

      await writeInstanceMetadata(
        config.instanceRoot,
        config.instanceID,
        instanceMetadata
      );
    } else if (instanceMetadata.status === STATUS.Unknown) {
      await createInstanceFolder(config.instanceRoot, config.instanceID, {
        type: "external",
      });

      instanceMetadata = await getInstanceMetadata(
        config.instanceRoot,
        config.instanceID
      );
    }

    let jobID: string | null = null;
    let jobProcess: ChildProcess | null = null;
    let jobQueue: string[] = await Promise.all(
      (
        await getInstanceFolderJobs(config.instanceRoot, config.instanceID)
      ).filter(async (jobID) => {
        const metadata = await getJobMetadata(
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
        await writeJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID,
          metadata
        );

        return true;
      })
    );

    let eventQueue: ClusterFileSystemEvent[] = [];
    watchInstanceFolder(config.instanceRoot, config.instanceID, async (event) =>
      eventQueue.push(event)
    );

    let lastRun = new Date().getTime();
    const interval = setInterval(async () => {
      const events = eventQueue;
      eventQueue = [];

      for (const event of events) {
        if (event.type === CLUSTER_FILESYSTEM_TYPE.InstanceUpdate) {
          instanceMetadata = await getInstanceMetadata(
            config.instanceRoot,
            event.instanceID
          );

          if (instanceMetadata.status === STATUS.Stopped)
            resolve(EXIT_CASE.Stop);
          else if (instanceMetadata.status === STATUS.Error)
            resolve(EXIT_CASE.Error);
        } else if (event.type === CLUSTER_FILESYSTEM_TYPE.JobUpdate) {
          const metadata = await getJobMetadata(
            config.instanceRoot,
            event.instanceID,
            event.jobID
          );

          if (metadata.status === STATUS.Pending) {
            if (jobQueue.findIndex((jID) => jID === event.jobID) == -1) {
              jobQueue.push(event.jobID);
            }
          } else if (metadata.status === STATUS.Stopped) {
            if (jobID === event.jobID) {
              console.log(
                `[Instance ${config.instanceID}] [Job ${jobID}] Stopped`
              );

              jobProcess?.kill();
              jobProcess = null;
              jobID = null;
            } else {
              jobQueue = jobQueue.filter((jID) => jID !== jobID);
            }
          }
        }
      }

      if (jobID === null) {
        const nextJobID = jobQueue.shift();

        if (nextJobID === undefined) {
          if (
            config.instanceCooldown >= 0 &&
            new Date().getTime() - lastRun > config.instanceCooldown * 1000
          ) {
            instanceMetadata.status = STATUS.Pending;

            await writeInstanceMetadata(
              config.instanceRoot,
              config.instanceID,
              instanceMetadata
            );

            console.log(`[Instance ${config.instanceID}] Cooldown`);

            clearInterval(interval);
            resolve(EXIT_CASE.Cooldown);
          }

          return;
        } else {
          lastRun = new Date().getTime();
        }

        jobID = nextJobID;
      }

      if (jobProcess === null) {
        const jobMetadata = await getJobMetadata(
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

        await writeJobMetadata(
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
        const jobMetadata = await getJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID
        );

        if (jobProcess.exitCode !== 255) jobMetadata.status = STATUS.Complete;
        else jobMetadata.status = STATUS.Error;

        console.log(
          `[Instance ${config.instanceID}] [Job ${jobID}] Exit with code ${jobProcess.exitCode}`
        );

        if (jobProcess.exitCode === 255) {
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Failed to run "${jobProcess.spawnargs.join(" ")}"`
          );
        }

        await writeJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID,
          jobMetadata
        );

        jobProcess = null;
        jobID = null;
      }
    }, config.instanceInterval * 1000);

    console.log(`[Instance ${config.instanceID}] Started`);
  });
}

async function main() {
  let status;
  let err = null;
  try {
    switch (await innerMain()) {
      case EXIT_CASE.Stop:
        status = STATUS.Stopped;
        break;
      case EXIT_CASE.Cooldown:
        status = STATUS.Pending;
        break;
      case EXIT_CASE.Error:
        status = STATUS.Error;
        break;
    }
  } catch (err) {
    status = STATUS.Error;
    err = null;
  }

  const metadata = await getInstanceMetadata(
    config.instanceRoot,
    config.instanceID
  );

  if (metadata.status !== STATUS.Unknown) {
    metadata.status = status;

    await writeInstanceMetadata(
      config.instanceRoot,
      config.instanceID,
      metadata
    );
  }

  if (err) throw err;
  else process.exit(0);
}

if (require.main === module) main();
