import * as AWS from "aws-sdk";

import { STATUS } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import { envInstanceConfig } from "@repo/app-config/instance";
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

    let ec2Res = null;
    try {
      ec2Res = await this.ec2
        .runInstances({
          ImageId: this.config.imageID,
          InstanceType: metadata.type ?? "t2.micro",
          MinCount: 1,
          MaxCount: 1,
          SecurityGroupIds: [this.config.securityGroupID],
          SubnetId: this.config.subnetID,
          IamInstanceProfile: {
            Arn: this.config.profileArn,
          },
          UserData: Buffer.from(this.getUserData(instanceID)).toString(
            "base64"
          ),
          BlockDeviceMappings: [
            {
              DeviceName: "/dev/sdh",
              Ebs: {
                VolumeSize: 20,
                DeleteOnTermination: true,
                VolumeType: "gp2",
                Encrypted: true,
              },
            },
          ],
        })
        .promise();
    } catch (e) {
      console.error(e);
    }

    const awsInstanceID = ec2Res?.Instances?.[0]?.InstanceId;

    if (!awsInstanceID) {
      metadata.status = STATUS.Error;
      await writeInstanceMetadata(
        this.config.instanceRoot,
        instanceID,
        metadata
      );
    }
  }

  protected getUserData(instanceID: string): string {
    const instanceEnv = envInstanceConfig({
      instanceID,
      ...this.config,
    });

    const instanceEnvString = Object.entries(instanceEnv)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(" ");

    return `#!/bin/bash
    # Install Packages
    yum install -y aws-cli amazon-efs-utils nodejs

    # Install App
    aws s3 cp s3://${this.config.assetPath} /app --recursive
    chmod +x ${this.config.hashcatPath}

    # Mount EFS
    mkdir ${this.config.fileSystemPath}
    mount -t efs ${this.config.fileSystemID}:/ ${this.config.fileSystemPath}

    # Run App
    ${instanceEnvString} node ${this.config.scriptPath}

    # Stop Instance
    EC2_INSTANCE_ID=$(wget -q -O - http://169.254.169.254/latest/meta-data/instance-id)
    aws ec2 terminate-instances --instance-ids $EC2_INSTANCE_ID 
    `;
  }
}
