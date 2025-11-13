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

  public abstract createInstanceFolder(
    instanceType: string
  ): Promise<string | null>;

  public abstract launchInstance(instanceID: string): Promise<void>;

  public abstract deleteInstance(instanceID: string): Promise<boolean>;

  public abstract createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string
  ): Promise<string | null>;

  public abstract createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string
  ): Promise<boolean>;

  public abstract deleteJob(
    instanceID: string,
    jobID: string
  ): Promise<boolean>;

  public abstract createWordlist(data: Buffer): Promise<string | null>;

  public abstract createWordlistFromStream(
    stream: NodeJS.ReadableStream,
    options?: { originBucket?: string; originKey?: string; targetID?: string }
  ): Promise<string | null>;

  public abstract deleteWordlist(wordlistID: string): Promise<boolean>;

  // Rules support: simple text files passed to hashcat with -r
  public abstract createRule(data: Buffer): Promise<string | null>;

  public abstract createRuleFromStream(
    stream: NodeJS.ReadableStream
  ): Promise<string | null>;

  public abstract deleteRule(ruleID: string): Promise<boolean>;

  // List all available rules
  public abstract listRules(): Promise<string[]>;
}
