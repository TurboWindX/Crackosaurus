import crypto from "crypto";

import { type ClusterStatus } from "@repo/api";
import { type DebugClusterConfig } from "@repo/app-config/cluster";

import { Cluster } from "./cluster";

export class DebugCluster extends Cluster<DebugClusterConfig> {
  public getName(): string {
    return "debug";
  }

  public getTypes(): string[] {
    return [this.getName()];
  }

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
    hashType: number,
    hashes: string[],
    rules?: string
  ): Promise<string | null> {
    const jobID = crypto.randomUUID();

    console.log(
      `Queued job ${jobID} using wordlist ${wordlist} on ${instanceID}`
    );

    return jobID;
  }

  public async createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rules?: string
  ): Promise<boolean> {
    console.log(
      `Queued job ${jobID} (existing ID) using wordlist ${wordlist} on ${instanceID}`
    );

    return true;
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

  public async createWordlistFromStream(
    stream: NodeJS.ReadableStream
  ): Promise<string | null> {
    const wordlistID = crypto.randomUUID();

    console.log(`Creating wordlist ${wordlistID} from stream`);

    // For debug cluster, just consume the stream without buffering
    return new Promise((resolve, reject) => {
      stream.on("end", () => resolve(wordlistID));
      stream.on("error", reject);
      stream.resume(); // Consume the stream
    });
  }

  public async deleteWordlist(wordlistID: string): Promise<boolean> {
    console.log(`Deleted wordlist ${wordlistID}`);

    return true;
  }
}
