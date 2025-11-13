import * as AWS from "aws-sdk";
import { type ChildProcess, execSync } from "child_process";
import fs from "fs";
import process from "process";

import { STATUS } from "@repo/api";
import {
  createInstanceFolder,
  getInstanceFolderJobs,
  getInstanceMetadata,
  getJobHashPath,
  getJobMetadata,
  getJobOutputPath,
  scheduleTempFileCleanup,
  writeInstanceMetadata,
  writeJobMetadata,
} from "@repo/filesystem/cluster";
import { getRulePath, getWordlistPath } from "@repo/filesystem/wordlist";
import { hashcat } from "@repo/hashcat/exe";

import config from "./config";

const EXIT_CASES = [0, 1, 2] as const;
type ExitCase = (typeof EXIT_CASES)[number];

const EXIT_CASE = {
  Stop: EXIT_CASES[0],
  Error: EXIT_CASES[1],
  Cooldown: EXIT_CASES[2],
} as const;

async function innerMain(): Promise<ExitCase> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    let instanceMetadata = await getInstanceMetadata(
      config.instanceRoot,
      config.instanceID
    );
    console.log(
      `[DEBUG] Initial instance metadata status: ${instanceMetadata.status}`
    );

    if (instanceMetadata.status === STATUS.Stopped) resolve(EXIT_CASE.Stop);
    else if (instanceMetadata.status === STATUS.Pending) {
      console.log(`[DEBUG] Instance is PENDING, setting to RUNNING`);
      instanceMetadata.status = STATUS.Running;

      // Fetch EC2 instance ID from instance metadata service
      try {
        const ec2Metadata = new AWS.MetadataService();
        const ec2InstanceId = await new Promise<string>((resolve, reject) => {
          ec2Metadata.request("/latest/meta-data/instance-id", (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
        instanceMetadata.ec2InstanceId = ec2InstanceId;
        console.log(`[DEBUG] Fetched EC2 instance ID: ${ec2InstanceId}`);
      } catch (e) {
        console.error(`[DEBUG] Failed to fetch EC2 instance ID:`, e);
      }

      await writeInstanceMetadata(
        config.instanceRoot,
        config.instanceID,
        instanceMetadata
      );
    } else if (instanceMetadata.status === STATUS.Unknown) {
      console.log(`[DEBUG] Instance is UNKNOWN, creating instance folder`);
      
      // Use instance type from config (passed as environment variable from CDK)
      await createInstanceFolder(config.instanceRoot, config.instanceID, {
        type: config.instanceType,
      });
      console.log(`[DEBUG] Instance folder created with type: ${config.instanceType}`);

      instanceMetadata = await getInstanceMetadata(
        config.instanceRoot,
        config.instanceID
      );
      console.log(
        `[DEBUG] New instance metadata status: ${instanceMetadata.status}`
      );
    }

    let jobID: string | null = null;
    let jobProcess: ChildProcess | null = null;
    const jobQueue: { jobID: string; retryCount: number }[] = [];

    // Instead of SQS we scan the instance job folder on disk and pick up any
    // pending jobs. This relies on atomic job creation (temp -> rename) to
    // avoid races.
    const scanJobsOnDisk = async () => {
      try {
        const jobs = await getInstanceFolderJobs(
          config.instanceRoot,
          config.instanceID
        );
        for (const jid of jobs) {
          // Skip if already queued
          if (jobQueue.some((j) => j.jobID === jid)) continue;
          try {
            const meta = await getJobMetadata(
              config.instanceRoot,
              config.instanceID,
              jid
            );
            if (meta.status === STATUS.Pending) {
              jobQueue.push({ jobID: jid, retryCount: 0 });
            }
          } catch {
            // Ignore missing/invalid metadata; job processing loop will retry
          }
        }
      } catch (e) {
        console.error(
          `[Instance ${config.instanceID}] Failed scanning jobs:`,
          e
        );
      }
    };

    // Do an initial scan of jobs already present on disk (in case they were
    // created before the instance agent started).
    await scanJobsOnDisk();

    // Start periodic cleanup of stale temp files created by atomic writers.
    // Default cleanup interval and max age are 10 minutes.
    void scheduleTempFileCleanup(
      config.instanceRoot,
      10 * 60 * 1000,
      10 * 60 * 1000
    );

    let lastRun = new Date().getTime();
    let hasProcessedAnyJob = false; // Track if we've ever processed a job

    const interval = setInterval(async () => {
      // Scan EFS for new job folders
      await scanJobsOnDisk();

      // Check for instance status updates
      instanceMetadata = await getInstanceMetadata(
        config.instanceRoot,
        config.instanceID
      );

      if (instanceMetadata.status === STATUS.Stopped)
        return resolve(EXIT_CASE.Stop);
      else if (instanceMetadata.status === STATUS.Error)
        return resolve(EXIT_CASE.Error);

      if (jobID === null) {
        const nextJob = jobQueue.shift();
        if (nextJob === undefined) {
          // ...existing code...
          const effectiveCooldown = hasProcessedAnyJob
            ? config.instanceCooldown
            : 300;
          if (
            effectiveCooldown >= 0 &&
            new Date().getTime() - lastRun > effectiveCooldown * 1000
          ) {
            instanceMetadata.status = STATUS.Pending;
            await writeInstanceMetadata(
              config.instanceRoot,
              config.instanceID,
              instanceMetadata
            );
            console.log(
              `[Instance ${config.instanceID}] Cooldown (waited ${effectiveCooldown}s, hasProcessedAnyJob: ${hasProcessedAnyJob})`
            );
            clearInterval(interval);
            resolve(EXIT_CASE.Cooldown);
          }
          return;
        } else {
          lastRun = new Date().getTime();
          hasProcessedAnyJob = true;
        }
        jobID = nextJob.jobID;
        // Track retryCount for this job
        jobQueue.unshift(nextJob); // Put it back so we can update retryCount if needed
      }

      console.log(
        `[Instance ${config.instanceID}] [DEBUG] jobID=${jobID}, jobProcess=${jobProcess ? "exists" : "null"}`
      );

      if (jobID && jobProcess === null) {
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Starting to process job ${jobID}`
        );
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Instance root: ${config.instanceRoot}`
        );
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Looking for job at: ${config.instanceRoot}/${config.instanceID}/jobs/${jobID}/metadata.json`
        );
        const jobMetadata = await getJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID
        );

        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Job metadata: ${JSON.stringify(jobMetadata)}`
        );
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Job metadata status: ${jobMetadata.status}, STATUS.Pending=${STATUS.Pending}`
        );

        // Validate that job's instanceType matches this instance's type (defense in depth)
        if (
          jobMetadata.instanceType &&
          jobMetadata.instanceType !== instanceMetadata.type
        ) {
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Job requires instanceType '${jobMetadata.instanceType}' but this instance is type '${instanceMetadata.type}'. Skipping job.`
          );
          jobID = null;
          return;
        }

        // If status is UNKNOWN, the job folder might not be visible yet (EFS propagation delay)
        // Put job back in queue and try again next interval, up to maxRetries
        if (jobMetadata.status === STATUS.Unknown) {
          // Find job in jobQueue to update retryCount
          const jobIndex = jobQueue.findIndex((job) => job.jobID === jobID);
          let retryCount = 1;
          if (jobIndex !== -1) {
            const existingJob = jobQueue[jobIndex];
            if (existingJob) {
              retryCount = existingJob.retryCount + 1;
            }
            jobQueue.splice(jobIndex, 1); // Remove old entry
          }
          const maxRetries = 5;
          if (retryCount < maxRetries) {
            console.log(
              `[Instance ${config.instanceID}] [DEBUG] Job metadata not ready yet (attempt ${retryCount}/${maxRetries}), putting back in queue`
            );
            jobQueue.unshift({ jobID, retryCount });
            jobID = null;
            return;
          } else {
            console.log(
              `[Instance ${config.instanceID}] [DEBUG] Job metadata still not ready after ${maxRetries} attempts, skipping job`
            );
            jobID = null;
            return;
          }
        }

        if (jobMetadata.status !== STATUS.Pending) {
          console.log(
            `[Instance ${config.instanceID}] [DEBUG] Skipping job - status is ${jobMetadata.status}`
          );
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

        const wordlistFile = getWordlistPath(
          config.wordlistRoot,
          jobMetadata.wordlist
        );

        const ruleFile =
          jobMetadata.rule && config.ruleRoot
            ? getRulePath(config.ruleRoot, jobMetadata.rule)
            : undefined;

        // If the expected wordlist file doesn't exist, capture a full EFS
        // recursive listing and write it to a log file for easier debugging.
        if (!fs.existsSync(wordlistFile)) {
          try {
            console.error(
              `[Instance ${config.instanceID}] [Job ${jobID}] Wordlist file not found: ${wordlistFile}`
            );
            const listing = execSync("ls -laR /mnt/efs", {
              encoding: "utf8",
              maxBuffer: 20 * 1024 * 1024,
            });
            console.log(
              `[Instance ${config.instanceID}] [Job ${jobID}] EFS recursive listing:\n${listing}`
            );
            try {
              fs.writeFileSync(
                `/var/log/efs-listing-${config.instanceID}-${jobID}.log`,
                listing
              );
            } catch (e) {
              console.error(
                `[Instance ${config.instanceID}] Failed to write EFS listing to /var/log: ${String(e)}`
              );
            }
          } catch (e) {
            console.error(
              `[Instance ${config.instanceID}] Failed to capture EFS listing: ${String(e)}`
            );
          }
        }

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
          wordlistFile,
          ruleFile,
        });
      } else if (jobProcess && jobProcess.exitCode !== null) {
        const jobMetadata = await getJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID
        );

        // Hashcat exit codes:
        // 0 = All hashes cracked
        // 1 = Exhausted (completed but not all hashes cracked) - treat as success
        // 2 = Aborted by user
        // -1 or other = Error (failed to run)
        if (jobProcess.exitCode === 0 || jobProcess.exitCode === 1) {
          jobMetadata.status = STATUS.Complete;
          console.log(
            `[Instance ${config.instanceID}] [Job ${jobID}] Completed with exit code ${jobProcess.exitCode}`
          );
        } else if (jobProcess.exitCode === 2) {
          jobMetadata.status = STATUS.Stopped;
          console.log(
            `[Instance ${config.instanceID}] [Job ${jobID}] Aborted by user (exit code 2)`
          );
        } else {
          jobMetadata.status = STATUS.Error;
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Hashcat failed with exit code ${jobProcess.exitCode}`
          );
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Command: "${jobProcess.spawnargs.join(" ")}"`
          );
        }

        console.log(
          `[Instance ${config.instanceID}] [Job ${jobID}] Exit with code ${jobProcess.exitCode}`
        );

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
  } catch {
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
