import * as AWS from "aws-sdk";
import crypto from "node:crypto";

import { type ClusterStatus } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import { type HashType } from "@repo/hashcat/data";

import { Cluster } from "./cluster";

export class AWSCluster extends Cluster<AWSClusterConfig> {
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
    if (!this.loadCredentials()) return false;

    this.ec2 = new AWS.EC2();

    return true;
  }

  public async tick(): Promise<void> {}

  public async createInstance(instanceType?: string): Promise<string | null> {
    try {
      const res = await this.ec2
        .runInstances({
          ImageId: this.config.imageId,
          InstanceType: instanceType ?? "t2.micro",
          MinCount: 1,
          MaxCount: 1,
        })
        .promise();

      const instanceId = res.Instances?.[0]?.InstanceId;
      if (!instanceId) return null;

      return instanceId;
    } catch (e) {
      return null;
    }
  }

  public async createJob(
    instanceID: string,
    _hashType: HashType,
    _hashes: string[]
  ): Promise<string | null> {
    try {
      await this.ec2
        .startInstances({
          InstanceIds: [instanceID],
        })
        .promise();

      return crypto.randomUUID();
    } catch (e) {
      return null;
    }
  }

  public async deleteJob(instanceId: string, _jobId: string): Promise<boolean> {
    try {
      await this.ec2
        .stopInstances({
          InstanceIds: [instanceId],
        })
        .promise();

      return true;
    } catch (e) {
      return false;
    }
  }

  public async getStatus(): Promise<ClusterStatus> {
    return {
      instances: {},
    };
  }

  public async deleteInstance(instanceId: string): Promise<boolean> {
    try {
      await this.ec2
        .terminateInstances({
          InstanceIds: [instanceId],
        })
        .promise();

      return true;
    } catch (e) {
      return false;
    }
  }
}
