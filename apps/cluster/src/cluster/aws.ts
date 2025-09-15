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

  public getName(): string {
    return "aws";
  }

  public getTypes(): string[] {
    return [
      DEFAULT_TYPE,
      "t3.small",
      "p3.8xlarge",
      "p3.16xlarge",
      "p3dn.24xlarge",
      "g3.16xlarge",
      "g4dn.xlarge",
      "g4dn.2xlarge",
      "g4dn.4xlarge",
      "g4dn.8xlarge",
      "g4dn.16xlarge",
      "g5.xlarge",
      "g5.2xlarge",
      "g5.4xlarge",
      "g5.8xlarge",
      "g5.48xlarge",
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

    return true;
  }

  protected async run(instanceID: string): Promise<void> {
    const metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );

    metadata.status = STATUS.Running;
    await writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    try {
      await this.stepFunctions
        .startExecution({
          stateMachineArn: this.config.stepFunctionArn,
          input: JSON.stringify({
            instanceID,
            instanceType: metadata.type ?? DEFAULT_TYPE,
          }),
        })
        .promise();
    } catch (e) {
      console.error(e);
    }
  }
}
