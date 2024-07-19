import { type ClusterStatus } from "@repo/api";

export abstract class ClusterConnector<TConfig = undefined> {
  public constructor(protected readonly config: TConfig) {}

  public abstract getStatus(): Promise<ClusterStatus | null>;

  public abstract load(): Promise<boolean>;

  public abstract createInstance(
    instanceType?: string | null
  ): Promise<string | null>;

  public abstract deleteInstance(instanceID: string): Promise<boolean>;

  public abstract createJob(
    instanceID: string,
    wordlistID: string,
    hashType: number,
    hashes: string[]
  ): Promise<string | null>;

  public abstract deleteJob(
    instanceID: string,
    jobID: string
  ): Promise<boolean>;

  public abstract createWordlist(buffer: Buffer): Promise<string | null>;

  public abstract deleteWordlist(wordlistID: string): Promise<boolean>;
}
