import * as AWS from "aws-sdk";

import { STATUS } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import {
  getInstanceMetadata,
  writeInstanceMetadata,
} from "@repo/filesystem/cluster";

import { FileSystemCluster } from "./filesystem";

const DEFAULT_TYPE = "p3.2xlarge";

export class AWSCluster extends FileSystemCluster<AWSClusterConfig> {
  private stepFunctions!: AWS.StepFunctions;
  private sqs!: AWS.SQS;

  public getName(): string {
    return "aws";
  }

  public getTypes(): string[] {
    return [
      // P3 - V100 GPUs (older generation, good for general compute)
      "p3.2xlarge", // 1x V100 (16GB)
      DEFAULT_TYPE, // p3.2xlarge is default
      "p3.8xlarge", // 4x V100 (64GB)
      "p3.16xlarge", // 8x V100 (128GB)
      "p3dn.24xlarge", // 8x V100 (256GB) with 100 Gbps networking

      // P4 - A100 GPUs (latest, most powerful)
      "p4d.24xlarge", // 8x A100 (320GB)

      // G5 - A10G GPUs (best price/performance for inference and training)
      "g5.xlarge", // 1x A10G (24GB)
      "g5.2xlarge", // 1x A10G (24GB)
      "g5.4xlarge", // 1x A10G (24GB)
      "g5.8xlarge", // 1x A10G (24GB)
      "g5.12xlarge", // 4x A10G (96GB)
      "g5.16xlarge", // 1x A10G (24GB)
      "g5.24xlarge", // 4x A10G (96GB)
      "g5.48xlarge", // 8x A10G (192GB)

      // G4dn - T4 GPUs (cost-effective for smaller workloads)
      "g4dn.xlarge", // 1x T4 (16GB)
      "g4dn.2xlarge", // 1x T4 (16GB)
      "g4dn.4xlarge", // 1x T4 (16GB)
      "g4dn.8xlarge", // 1x T4 (16GB)
      "g4dn.12xlarge", // 4x T4 (64GB)
      "g4dn.16xlarge", // 1x T4 (16GB)
      "g4dn.metal", // 8x T4 (128GB)

      // G3 - M60 GPUs (legacy, not recommended for new deployments)
      "g3.4xlarge", // 1x M60 (8GB)
      "g3.8xlarge", // 2x M60 (16GB)
      "g3.16xlarge", // 4x M60 (32GB)

      // Testing/development (non-GPU)
      "t3.small", // For testing without GPU
      "t3.medium",
      "t3.large",
    ];
  }

  private loadCredentials(): Promise<boolean> {
    return new Promise((resolve) =>
      AWS.config.getCredentials((err) => {
        if (err) resolve(false);
        else resolve(true);
      })
    );
  }

  public async load(): Promise<boolean> {
    if (!(await super.load())) return false;
    if (!(await this.loadCredentials())) return false;

    this.stepFunctions = new AWS.StepFunctions();
    this.sqs = new AWS.SQS();

    return true;
  }

  protected async run(instanceID: string): Promise<void> {
    console.log(`[AWS Cluster] run() called with instanceID: ${instanceID}`);
    const metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );
    console.log(`[AWS Cluster] Instance metadata:`, JSON.stringify(metadata));

    metadata.status = STATUS.Running;
    await writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    const stepFunctionInput = {
      instanceID,
      instanceType: metadata.type ?? DEFAULT_TYPE,
    };
    console.log(
      `[AWS Cluster] Starting Step Functions execution with input:`,
      JSON.stringify(stepFunctionInput)
    );

    try {
      const result = await this.stepFunctions
        .startExecution({
          stateMachineArn: this.config.stepFunctionArn,
          input: JSON.stringify(stepFunctionInput),
        })
        .promise();
      console.log(`[AWS Cluster] Step Functions started:`, result.executionArn);
    } catch (e) {
      console.error(`[AWS Cluster] Step Functions error:`, e);
    }
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    console.log(
      `[AWS Cluster] deleteInstance() called for instanceID: ${instanceID}`
    );

    // First, mark instance as stopped in filesystem (calls parent)
    const result = await super.deleteInstance(instanceID);

    // Try to terminate the EC2 instance if it exists
    try {
      const metadata = await getInstanceMetadata(
        this.config.instanceRoot,
        instanceID
      );

      if (metadata.ec2InstanceId) {
        console.log(
          `[AWS Cluster] Terminating EC2 instance: ${metadata.ec2InstanceId}`
        );

        const ec2 = new AWS.EC2();
        try {
          await ec2
            .terminateInstances({
              InstanceIds: [metadata.ec2InstanceId],
            })
            .promise();
          console.log(
            `[AWS Cluster] EC2 instance ${metadata.ec2InstanceId} termination initiated`
          );
        } catch (e: unknown) {
          // Ignore "InvalidInstanceID.NotFound" errors (instance already terminated)
          if (
            e &&
            typeof e === "object" &&
            "code" in e &&
            e.code === "InvalidInstanceID.NotFound"
          ) {
            console.log(
              `[AWS Cluster] EC2 instance ${metadata.ec2InstanceId} already terminated`
            );
          } else {
            console.error(`[AWS Cluster] Failed to terminate EC2 instance:`, e);
            // Don't fail the whole operation, just log the error
          }
        }
      } else {
        console.log(
          `[AWS Cluster] No EC2 instance ID found in metadata, instance may not have been started yet or already deleted`
        );
      }
    } catch (e) {
      console.error(`[AWS Cluster] Error reading instance metadata:`, e);
      // Continue anyway - the instance folder may have been deleted already
    }

    return result;
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[]
  ): Promise<string | null> {
    // Call parent to create job folder and metadata
    const jobID = await super.createJob(instanceID, wordlist, hashType, hashes);

    if (!jobID) {
      console.log(
        `[AWS Cluster] Failed to create job for instance ${instanceID}`
      );
      return null;
    }

    // Send SQS notification if queue URL is configured
    if (this.config.jobQueueUrl) {
      try {
        await this.sqs
          .sendMessage({
            QueueUrl: this.config.jobQueueUrl,
            MessageBody: JSON.stringify({
              instanceID,
              jobID,
            }),
          })
          .promise();
        console.log(
          `[AWS Cluster] Sent SQS notification for job ${jobID} on instance ${instanceID}`
        );
      } catch (e) {
        console.error(`[AWS Cluster] Failed to send SQS message:`, e);
      }
    } else {
      console.log(
        `[AWS Cluster] No SQS queue URL configured, skipping notification`
      );
    }

    return jobID;
  }
}
