import * as AWS from "aws-sdk";

import { STATUS } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import { INSTANCE_TYPE_VALUES } from "@repo/app-config/instance-types";
import { DEFAULT_INSTANCE_TYPE } from "@repo/app-config/instance-types";
import {
  getInstanceMetadata,
  writeInstanceMetadata,
} from "@repo/filesystem/cluster";

import { FileSystemCluster } from "./filesystem";

const DEFAULT_TYPE = DEFAULT_INSTANCE_TYPE;

export class AwsCluster extends FileSystemCluster<AWSClusterConfig> {
  public async listRules(): Promise<string[]> {
    // AWSCluster stores rules in EFS, so delegate to FileSystemCluster
    return super.listRules();
  }
  private stepFunctions!: AWS.StepFunctions;
  private s3!: AWS.S3;

  public getName(): string {
    return "aws";
  }

  public getTypes(): string[] {
    // Use canonical list from shared config so UI and server stay in sync
    return INSTANCE_TYPE_VALUES.concat([DEFAULT_TYPE]);
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
    this.s3 = new AWS.S3();

    return true;
  }

  /**
   * Create instance folder only, without launching EC2.
   * Returns instanceID which can be used to create job folders before launching.
   */
  public async createInstanceFolder(instanceType: string): Promise<string | null> {
    // Call parent to create instance folder and metadata
    const instanceID = await super.createInstanceFolder(instanceType);

    if (!instanceID) {
      console.log(
        `[AWS Cluster] Failed to create instance folder for type ${instanceType}`
      );
      return null;
    }

    // Validate instance type early so we fail fast with a clear message
    const supported = this.getTypes();
    if (!supported.includes(instanceType)) {
      console.error(
        `[AWS Cluster] Unsupported instance type requested: ${instanceType}`
      );
      // Mark instance as error in metadata so it's visible in EFS
      try {
        const metadata = await getInstanceMetadata(
          this.config.instanceRoot,
          instanceID
        );
        metadata.status = STATUS.Error;
        (metadata as Record<string, unknown>)["error"] =
          `Unsupported instance type: ${instanceType}`;
        await writeInstanceMetadata(
          this.config.instanceRoot,
          instanceID,
          metadata
        );
      } catch {
        // ignore metadata write errors
      }

      throw new Error(`Unsupported instance type: ${instanceType}`);
    }

    return instanceID;
  }

  /**
   * Launch EC2 instance for an existing instance folder.
   * Should be called after job folders are created.
   */
  public async launchInstance(instanceID: string): Promise<void> {
    console.log(`[AWS Cluster] launchInstance() called with instanceID: ${instanceID}`);
    
    // Verify the instance folder exists before launching EC2
    // Retry a few times to account for EFS propagation delays
    let metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );
    
    let attempts = 0;
    const maxAttempts = 10;
    while (metadata.status === STATUS.Unknown && attempts < maxAttempts) {
      console.log(`[AWS Cluster] Instance folder not found yet, waiting 500ms (attempt ${attempts + 1}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      metadata = await getInstanceMetadata(
        this.config.instanceRoot,
        instanceID
      );
      attempts++;
    }
    
    console.log(`[AWS Cluster] Verified instance folder exists with metadata:`, JSON.stringify(metadata));
    
    if (metadata.status === STATUS.Unknown) {
      throw new Error(`Instance folder ${instanceID} not found on EFS after ${maxAttempts} attempts`);
    }
    
    await this.run(instanceID);
  }

  public async createInstance(instanceType: string): Promise<string | null> {
    const instanceID = await this.createInstanceFolder(instanceType);
    if (!instanceID) return null;
    
    await this.launchInstance(instanceID);
    return instanceID;
  }

  public async createWordlistFromStream(
    stream: NodeJS.ReadableStream,
    options?: { originBucket?: string; originKey?: string }
  ): Promise<string | null> {
    // Call parent implementation to write stream to EFS
    const wordlistID = await super.createWordlistFromStream(stream, options);

    // If we have origin S3 info, attempt to delete the original object now that it
    // has been written to EFS successfully. Deletion is best-effort and errors are
    // logged but do not fail the overall operation.
    if (wordlistID && options?.originBucket && options?.originKey && this.s3) {
      try {
        await this.s3
          .deleteObject({
            Bucket: options.originBucket,
            Key: options.originKey,
          })
          .promise();
        console.log(
          `[AWS Cluster] Deleted origin S3 object s3://${options.originBucket}/${options.originKey} after writing wordlist ${wordlistID}`
        );
      } catch (e) {
        console.error(
          `[AWS Cluster] Failed to delete origin S3 object s3://${options?.originBucket}/${options?.originKey}:`,
          e
        );
      }
    }

    return wordlistID;
  }

  /**
   * Downloads a wordlist from S3 and writes it to EFS using the stream logic.
   * Returns the wordlistID if successful, null otherwise.
   */
  public async copyWordlistFromS3ToEFS(
    s3Bucket: string,
    s3Key: string,
    targetID?: string
  ): Promise<string | null> {
    if (!this.s3) {
      this.s3 = new AWS.S3();
    }
    try {
      const s3Stream = this.s3
        .getObject({ Bucket: s3Bucket, Key: s3Key })
        .createReadStream();
      // Use the origin info so the S3 object is deleted after copy.
      // Pass through an optional targetID so the server can request a specific
      // final filename on EFS (avoids mismatched IDs between DB and EFS).
      const opts: {
        originBucket: string;
        originKey: string;
        targetID?: string;
      } = {
        originBucket: s3Bucket,
        originKey: s3Key,
      };
      if (targetID) opts.targetID = targetID;

      const wordlistID = await this.createWordlistFromStream(s3Stream, opts);
      if (wordlistID) {
        console.log(
          `[AWSCluster] Successfully copied wordlist from S3 (${s3Bucket}/${s3Key}) to EFS as ${wordlistID}`
        );
      } else {
        console.error(
          `[AWSCluster] Failed to copy wordlist from S3 (${s3Bucket}/${s3Key}) to EFS`
        );
      }
      return wordlistID;
    } catch (err) {
      console.error(`[AWSCluster] Error copying wordlist from S3 to EFS:`, err);
      return null;
    }
  }

  public async copyRuleFromS3ToEFS(
    s3Bucket: string,
    s3Key: string
  ): Promise<string | null> {
    if (!this.s3) {
      this.s3 = new AWS.S3();
    }
    try {
      const s3Stream = this.s3
        .getObject({ Bucket: s3Bucket, Key: s3Key })
        .createReadStream();

      const ruleID = await this.createRuleFromStream(s3Stream);
      if (ruleID) {
        console.log(
          `[AWSCluster] Successfully copied rule from S3 (${s3Bucket}/${s3Key}) to EFS as ${ruleID}`
        );
      } else {
        console.error(
          `[AWSCluster] Failed to copy rule from S3 (${s3Bucket}/${s3Key}) to EFS`
        );
      }
      return ruleID;
    } catch (err) {
      console.error(`[AWSCluster] Error copying rule from S3 to EFS:`, err);
      return null;
    }
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
      if (!this.config.stepFunctionArn) {
        throw new Error("Step Function ARN not configured for AwsCluster");
      }

      const result = await this.stepFunctions
        .startExecution({
          stateMachineArn: this.config.stepFunctionArn,
          input: JSON.stringify(stepFunctionInput),
        })
        .promise();
      console.log(`[AWS Cluster] Step Functions started:`, result.executionArn);
    } catch (e) {
      console.error(`[AWS Cluster] Step Functions error:`, e);

      // Mark instance metadata as Error and save the error message for debugging
      try {
        const failedMetadata = await getInstanceMetadata(
          this.config.instanceRoot,
          instanceID
        );
        failedMetadata.status = STATUS.Error;
        const errMsg =
          e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : String(e);
        (failedMetadata as Record<string, unknown>)["error"] = errMsg;
        await writeInstanceMetadata(
          this.config.instanceRoot,
          instanceID,
          failedMetadata
        );
      } catch (w) {
        console.error(`[AWS Cluster] Failed to write error metadata:`, w);
      }

      // Re-throw so upstream callers (and the server) receive a clear failure
      throw e;
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
    hashes: string[],
    rule?: string
  ): Promise<string | null> {
    // Call parent to create job folder and metadata
    const jobID = await super.createJob(
      instanceID,
      wordlist,
      hashType,
      hashes,
      rule
    );

    if (!jobID) {
      console.log(
        `[AWS Cluster] Failed to create job for instance ${instanceID}`
      );
      return null;
    }

    // Job metadata written to EFS by parent FileSystemCluster.createJob;
    // instances will discover pending jobs by scanning EFS.

    return jobID;
  }

  public async createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string
  ): Promise<boolean> {
    // Call parent to create job folder and metadata with specified ID
    const result = await super.createJobWithID(
      instanceID,
      jobID,
      wordlist,
      hashType,
      hashes,
      rule
    );

    if (!result) {
      console.log(
        `[AWS Cluster] Failed to create job ${jobID} for instance ${instanceID}`
      );
      return false;
    }

    // Send SQS notification
    // SQS removed: the job metadata has already been written to EFS by the
    // filesystem layer; instances will scan EFS for pending jobs.

    return true;
  }
}
