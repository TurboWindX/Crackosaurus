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
    rule?: string,
    attackMode?: number,
    mask?: string
  ): Promise<string | null>;

  public abstract createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string,
    attackMode?: number,
    mask?: string,
    ntWordlist?: string[]
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

  // Clean up stale instance folders (empty jobs, not running)
  public abstract cleanupStaleInstances(): Promise<number>;

  /**
   * Check which instance types are available in the current region/AZs.
   * Returns a map of instanceType → { available: boolean, azs: string[] }.
   * Non-AWS clusters return all types as available.
   */
  public async checkInstanceAvailability(): Promise<
    Record<string, { available: boolean; azs: string[] }>
  > {
    // Default: report all types as available (no cloud info)
    const result: Record<string, { available: boolean; azs: string[] }> = {};
    for (const t of this.getTypes()) {
      result[t] = { available: true, azs: [] };
    }
    return result;
  }
}
