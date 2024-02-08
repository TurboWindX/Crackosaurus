import crypto from "crypto";

import { type HashType } from "@repo/api";

import { InstanceAPI } from "./instance";

export class DebugInstanceAPI extends InstanceAPI {
  private instances: Record<string, boolean> = {};

  public async load(): Promise<boolean> {
    console.log("Debug Instance API loaded");

    return true;
  }

  public async create(
    hashType: HashType,
    hashes: string[],
    instanceType?: string | undefined
  ): Promise<string | null> {
    const uuid = crypto.randomUUID();

    console.log(
      `Creating instance ${uuid} of type ${instanceType} with ${hashes.length} hash(es) of type ${hashType}`
    );

    this.instances[uuid] = true;

    return uuid;
  }

  public async start(instanceId: string): Promise<boolean> {
    if (this.instances[instanceId]) {
      console.log(`Starting instance ${instanceId}`);

      return true;
    } else {
      console.log(`Could not find instance ${instanceId}`);

      return false;
    }
  }

  public async stop(instanceId: string): Promise<boolean> {
    if (this.instances[instanceId]) {
      console.log(`Stopping instance ${instanceId}`);

      return true;
    } else {
      console.log(`Could not find instance ${instanceId}`);

      return false;
    }
  }

  public async terminate(instanceId: string): Promise<boolean> {
    if (this.instances[instanceId]) {
      console.log(`Terminating instance ${instanceId}`);

      delete this.instances[instanceId];

      return true;
    } else {
      console.log(`Could not find instance ${instanceId}`);

      return false;
    }
  }
}
