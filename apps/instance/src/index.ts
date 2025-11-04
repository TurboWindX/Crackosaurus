import * as AWS from "aws-sdk";
import { type ChildProcess } from "child_process";
import process from "process";

import { STATUS } from "@repo/api";
import {
  createInstanceFolder,
  getInstanceMetadata,
  getJobHashPath,
  getJobMetadata,
  getJobOutputPath,
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
      await createInstanceFolder(config.instanceRoot, config.instanceID, {
        type: "external",
      });
      console.log(`[DEBUG] Instance folder created`);

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
    const jobQueue: string[] = [];

    // Initialize SQS client for receiving job notifications
    const sqs = new AWS.SQS({ region: "ca-central-1" });
    console.log(
      `[Instance ${config.instanceID}] SQS queue URL: ${config.jobQueueUrl}`
    );

    // SQS polling function
    const pollSQS = async () => {
      if (!config.jobQueueUrl) {
        console.log(
          `[Instance ${config.instanceID}] No SQS queue URL configured, skipping poll`
        );
        return;
      }

      try {
        const result = await sqs
          .receiveMessage({
            QueueUrl: config.jobQueueUrl,
            MaxNumberOfMessages: 10, // Process up to 10 jobs at once
            WaitTimeSeconds: 20, // Long polling
            VisibilityTimeout: 900, // 15 minutes (matches queue config)
          })
          .promise();

        if (result.Messages && result.Messages.length > 0) {
          console.log(
            `[Instance ${config.instanceID}] Received ${result.Messages.length} SQS messages`
          );

          for (const message of result.Messages) {
            try {
              const body = JSON.parse(message.Body || "{}");
              const messageInstanceID = body.instanceID;
              const messageJobID = body.jobID;

              // Only process messages for this instance
              if (messageInstanceID === config.instanceID) {
                console.log(
                  `[Instance ${config.instanceID}] Adding job ${messageJobID} to queue from SQS`
                );

                // Add to job queue if not already present
                if (!jobQueue.includes(messageJobID)) {
                  jobQueue.push(messageJobID);
                }

                // Delete message from queue since we're processing it
                await sqs
                  .deleteMessage({
                    QueueUrl: config.jobQueueUrl,
                    ReceiptHandle: message.ReceiptHandle!,
                  })
                  .promise();

                console.log(
                  `[Instance ${config.instanceID}] Deleted SQS message for job ${messageJobID}`
                );
              } else {
                console.log(
                  `[Instance ${config.instanceID}] Ignoring job ${messageJobID} for different instance ${messageInstanceID}, making visible immediately`
                );

                // Make message immediately visible again so the correct instance can pick it up
                await sqs
                  .changeMessageVisibility({
                    QueueUrl: config.jobQueueUrl,
                    ReceiptHandle: message.ReceiptHandle!,
                    VisibilityTimeout: 0,
                  })
                  .promise();
              }
            } catch (err) {
              console.error(
                `[Instance ${config.instanceID}] Error processing SQS message:`,
                err
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `[Instance ${config.instanceID}] Error polling SQS:`,
          err
        );
      }
    };

    let lastRun = new Date().getTime();
    let hasProcessedAnyJob = false; // Track if we've ever processed a job

    const interval = setInterval(async () => {
      // Poll SQS for new job notifications
      await pollSQS();

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
        const nextJobID = jobQueue.shift();

        if (nextJobID === undefined) {
          // Use different cooldown periods based on whether we've processed jobs
          // If we've never processed a job, wait 5 minutes for initial job creation
          // If we have processed jobs, use the configured cooldown (default 60s)
          const effectiveCooldown = hasProcessedAnyJob
            ? config.instanceCooldown
            : 300; // 5 minutes for initial wait

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
          hasProcessedAnyJob = true; // Mark that we've started processing at least one job
        }

        jobID = nextJobID;
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

        // If status is UNKNOWN, the job folder might not be visible yet (EFS propagation delay)
        // Put job back in queue and try again next interval
        if (jobMetadata.status === STATUS.Unknown) {
          console.log(
            `[Instance ${config.instanceID}] [DEBUG] Job metadata not ready yet, putting back in queue`
          );
          jobQueue.unshift(jobID); // Put back at front of queue
          jobID = null;
          return;
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
