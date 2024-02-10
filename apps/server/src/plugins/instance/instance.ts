import { type HashType } from "@repo/api";

export abstract class InstanceAPI<TConfig = undefined> {
  protected readonly config: TConfig;

  public constructor(config: TConfig) {
    this.config = config;
  }

  public abstract load(): Promise<boolean>;
  public abstract create(instanceType?: string): Promise<string | null>;
  public abstract queue(
    instanceId: string,
    jobId: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<boolean>;
  public abstract dequeue(instanceId: string, jobId: string): Promise<boolean>;
  public abstract terminate(instanceId: string): Promise<boolean>;
}
