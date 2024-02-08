import { type HashType } from "@repo/api";

export abstract class InstanceAPI<TConfig = undefined> {
  protected readonly config: TConfig;

  public constructor(config: TConfig) {
    this.config = config;
  }

  public abstract load(): Promise<boolean>;
  public abstract create(hashType: HashType, hashes: string[], instanceType?: string): Promise<string | null>;
  public abstract start(instanceId: string): Promise<boolean>;
  public abstract stop(instanceId: string): Promise<boolean>;
  public abstract terminate(instanceId: string): Promise<boolean>;
}
