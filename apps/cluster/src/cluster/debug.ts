import crypto from "crypto";

import { type ClusterStatus } from "@repo/api";
import { DebugClusterConfig } from "@repo/app-config";
import { type HashType } from "@repo/hashcat/data";

import { Cluster } from "./cluster";

export class DebugCluster extends Cluster<DebugClusterConfig> {
  public async load(): Promise<boolean> {
    console.log("Debug Cluster loaded");

    return true;
  }

  public async tick(): Promise<void> {}

  public async createInstance(
    instanceType?: string | undefined
  ): Promise<string | null> {
    const uuid = crypto.randomUUID();

    console.log(`Creating instance ${uuid} of type ${instanceType}`);

    return uuid;
  }

  public async createJob(
    instanceID: string,
    _hashType: HashType,
    _hashes: string[]
  ): Promise<string | null> {
    const jobID = crypto.randomUUID();

    console.log(`Queued job ${jobID} on ${instanceID}`);

    return jobID;
  }

  public async deleteJob(instanceId: string, jobId: string): Promise<boolean> {
    console.log(`Dequeued job ${jobId} on ${instanceId}`);

    return true;
  }

  public async getStatus(): Promise<ClusterStatus> {
    return {
      instances: {},
    };
  }

  public async deleteInstance(instanceId: string): Promise<boolean> {
    console.log(`Terminating instance ${instanceId}`);

    return true;
  }
}
