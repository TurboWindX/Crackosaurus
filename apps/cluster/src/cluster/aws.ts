import * as AWS from "aws-sdk";

import { STATUS } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import {
  getInstanceMetadata,
  writeInstanceMetadata,
} from "@repo/filesystem/cluster";

import { FileSystemCluster } from "./filesystem";

export class AWSCluster extends FileSystemCluster<AWSClusterConfig> {
  private stepFunctions!: AWS.StepFunctions;

  private loadCredentials(): Promise<boolean> {
    return new Promise(async (resolve) =>
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

    let res = null;
    try {
      res = await this.stepFunctions
        .startExecution({
          stateMachineArn: this.config.stepFunctionArn,
          input: JSON.stringify({
            instanceID,
            instanceType: metadata.type ?? "t2.micro",
          }),
        })
        .promise();
    } catch (e) {
      console.error(e);
    }
  }
}
