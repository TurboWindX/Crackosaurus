import crypto from "crypto";

import { type HashType } from "@repo/api";

import { InstanceAPI } from "./instance";

export class DebugInstanceAPI extends InstanceAPI {
  public async load(): Promise<boolean> {
    console.log("Debug Instance API loaded");

    return true;
  }

  public async create(
    instanceType?: string | undefined
  ): Promise<string | null> {
    const uuid = crypto.randomUUID();

    console.log(`Creating instance ${uuid} of type ${instanceType}`);

    return uuid;
  }

  public async queue(
    instanceId: string,
    jobId: string,
    _hashType: HashType,
    _hashes: string[]
  ): Promise<boolean> {
    console.log(`Queued job ${jobId} on ${instanceId}`);

    return true;
  }

  public async dequeue(instanceId: string, jobId: string): Promise<boolean> {
    console.log(`Dequeued job ${jobId} on ${instanceId}`);

    return true;
  }

  public async terminate(instanceId: string): Promise<boolean> {
    console.log(`Terminating instance ${instanceId}`);

    return true;
  }
}
