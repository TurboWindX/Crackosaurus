import * as AWS from "aws-sdk";

import { STATUS } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import {
  getInstanceMetadata,
  writeInstanceMetadata,
} from "@repo/filesystem/cluster";

import { FileSystemCluster } from "./filesystem";

export class AWSCluster extends FileSystemCluster<AWSClusterConfig> {
  private ec2!: AWS.EC2;

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

    this.ec2 = new AWS.EC2();

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
      const res = await this.ec2
        .runInstances({
          ImageId: this.config.imageID,
          InstanceType: metadata.type ?? "t2.micro",
          MinCount: 1,
          MaxCount: 1,
        })
        .promise();

      const instanceID = res.Instances?.[0]?.InstanceId;
      if (!instanceID) return;
    } catch (e) {}
  }
}
