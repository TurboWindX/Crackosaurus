import { type ClusterStatus } from "@repo/api";

export abstract class Cluster<TConfig = undefined> {
  public constructor(protected readonly config: TConfig) {}

  public abstract getName(): string;

  public abstract getTypes(): string[];

  public abstract getStatus(): Promise<ClusterStatus>;

  public abstract load(): Promise<boolean>;

  public abstract createInstance(
    instanceType?: string | null
  ): Promise<string | null>;

  public abstract deleteInstance(instanceID: string): Promise<boolean>;

  public abstract createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[]
  ): Promise<string | null>;

  public abstract createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[]
  ): Promise<boolean>;

  public abstract deleteJob(
    instanceID: string,
    jobID: string
  ): Promise<boolean>;

  public abstract createWordlist(data: Buffer): Promise<string | null>;

  public abstract createWordlistFromStream(
    stream: NodeJS.ReadableStream
  ): Promise<string | null>;

  public abstract deleteWordlist(wordlistID: string): Promise<boolean>;
}
