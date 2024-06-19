import crypto from "crypto";

import { type ClusterStatus } from "@repo/api";
import { type DebugClusterConfig } from "@repo/app-config/cluster";
import { type HashType } from "@repo/hashcat/data";

import { Cluster } from "./cluster";

export class DebugCluster extends Cluster<DebugClusterConfig> {
  public async load(): Promise<boolean> {
    console.log("Debug Cluster loaded");

    return true;
  }

  public async getStatus(): Promise<ClusterStatus> {
    return {
      instances: {},
    };
  }

  public async createInstance(
    instanceType?: string | undefined
  ): Promise<string | null> {
    const uuid = crypto.randomUUID();

    console.log(`Creating instance ${uuid} of type ${instanceType}`);

    return uuid;
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    console.log(`Terminating instance ${instanceID}`);

    return true;
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    _hashType: HashType,
    _hashes: string[]
  ): Promise<string | null> {
    const jobID = crypto.randomUUID();

    console.log(
      `Queued job ${jobID} using wordlist ${wordlist} on ${instanceID}`
    );

    return jobID;
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    console.log(`Dequeued job ${jobID} on ${instanceID}`);

    return true;
  }

  public async createWordlist(data: Buffer): Promise<string | null> {
    const wordlistID = crypto.randomUUID();

    console.log(`Creating wordlist ${wordlistID} of size ${data.length}`);

    return wordlistID;
  }

  public async deleteWordlist(wordlistID: string): Promise<boolean> {
    console.log(`Deleted wordlist ${wordlistID}`);

    return true;
  }
}
