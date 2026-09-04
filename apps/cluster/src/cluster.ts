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

  /**
   * Reconcile in-flight instance launches. Cloud clusters that provision
   * hardware asynchronously override this to poll the launch, retry transient
   * capacity failures (park-and-retry), and terminally fail launches that
   * cannot succeed. Non-cloud clusters have nothing to reconcile.
   *
   * Returns the instance IDs that were parked for a later retry and those that
   * were marked terminally errored during this pass.
   */
  public async reconcileLaunches(): Promise<{
    parked: string[];
    errored: string[];
  }> {
    return { parked: [], errored: [] };
  }

  /**
   * Return the instanceIDs that currently have a LIVE provisioned box (e.g. a
   * running/pending EC2 instance), or null if liveness cannot be determined.
   *
   * The server's stale-instance reaper stops any non-terminal DB instance whose
   * tag is absent from this set. A null return therefore means "unknown" and the
   * reaper does NOTHING — never a false mass-stop. This default returns null
   * because a non-cloud cluster has no hardware to inspect; cloud clusters
   * override it with a real provider query (and still return null on API error).
   */
  public async getLiveInstanceIDs(): Promise<string[] | null> {
    return null;
  }
}
