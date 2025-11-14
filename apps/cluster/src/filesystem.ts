import crypto from "crypto";

import { type ClusterStatus, STATUS } from "@repo/api";
import { type FileSystemClusterConfig } from "@repo/app-config/cluster";
import {
  createClusterFolder,
  createInstanceFolder,
  createJobFolder,
  deleteWordlistFile,
  getClusterFolderInstances,
  getClusterFolderStatus,
  getInstanceFolderJobs,
  getInstanceMetadata,
  getJobMetadata,
  writeInstanceMetadata,
  writeJobMetadata,
  writeWordlistFile,
  writeWordlistFileFromStream,
} from "@repo/filesystem/cluster";
import { scheduleTempFileCleanup } from "@repo/filesystem/cluster";
import {
  deleteRuleFile,
  writeRuleFile,
  writeRuleFileFromStream,
} from "@repo/filesystem/cluster";
import { createRuleFolder } from "@repo/filesystem/wordlist";
import { createWordlistFolder } from "@repo/filesystem/wordlist";

import { Cluster } from "./cluster";

export abstract class FileSystemCluster<
  TConfig extends FileSystemClusterConfig,
> extends Cluster<TConfig> {
  protected abstract run(instanceID: string): Promise<void>;

  public async load(): Promise<boolean> {
    await createClusterFolder(this.config.instanceRoot);
    // Start periodic cleanup of stale temp files under the instance root.
    // This helps remove .tmp-* artifacts left by interrupted writers.
    void scheduleTempFileCleanup(this.config.instanceRoot);
    await createWordlistFolder(this.config.wordlistRoot);
    await createRuleFolder(this.config.ruleRoot);

    Promise.all(
      (await getClusterFolderInstances(this.config.instanceRoot)).map(
        async (instanceID) => {
          const instanceMetadata = await getInstanceMetadata(
            this.config.instanceRoot,
            instanceID
          );
          if (instanceMetadata.status === STATUS.Stopped) return;
          instanceMetadata.status = STATUS.Pending;

          await writeInstanceMetadata(
            this.config.instanceRoot,
            instanceID,
            instanceMetadata
          );

          // Do not auto-start instances on service load. Instances should only
          // be started explicitly (for example when an admin approves a job
          // and the server requests a new instance). Auto-starting on load
          // caused unexpected EC2 instance launches during redeploys.
        }
      )
    );

    return true;
  }

  public async getStatus(): Promise<ClusterStatus> {
    return getClusterFolderStatus(this.config.instanceRoot);
  }

  public async createInstanceFolder(
    instanceType: string
  ): Promise<string | null> {
    const instanceID = crypto.randomUUID();

    await createInstanceFolder(this.config.instanceRoot, instanceID, {
      type: instanceType,
    });

    return instanceID;
  }

  public async launchInstance(instanceID: string): Promise<void> {
    // Base FileSystemCluster doesn't have a launch mechanism
    // Subclasses like AwsCluster override this to launch EC2 instances
    await this.run(instanceID);
  }

  public async createInstance(instanceType: string): Promise<string | null> {
    const instanceID = await this.createInstanceFolder(instanceType);
    if (!instanceID) return null;

    await this.launchInstance(instanceID);
    return instanceID;
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    const jobs = await getInstanceFolderJobs(
      this.config.instanceRoot,
      instanceID
    );

    await Promise.allSettled(
      jobs.map(async (jobID: string) => await this.deleteJob(instanceID, jobID))
    );

    const metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );

    metadata.status = STATUS.Stopped;

    await writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    return true;
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string
  ): Promise<string | null> {
    console.log(`[Cluster] createJob called with instanceID: ${instanceID}`);
    const jobID = crypto.randomUUID();

    return (await this.createJobWithID(
      instanceID,
      jobID,
      wordlist,
      hashType,
      hashes,
      rule
    ))
      ? jobID
      : null;
  }

  public async createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string
  ): Promise<boolean> {
    console.log(
      `[Cluster] createJobWithID called with instanceID: ${instanceID}, jobID: ${jobID}`
    );

    const instanceMetadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );
    console.log(
      `[Cluster] Instance ${instanceID} metadata:`,
      JSON.stringify(instanceMetadata)
    );

    await createJobFolder(this.config.instanceRoot, instanceID, jobID, {
      wordlist,
      hashes,
      hashType,
      rule,
      instanceType: instanceMetadata.type,
    });
    console.log(
      `[Cluster] Job ${jobID} created in ${this.config.instanceRoot}/${instanceID}/jobs/ with instanceType: ${instanceMetadata.type}`
    );

    // Do not auto-launch workers here. Instance lifecycle (start) should be
    // controlled explicitly via `createInstance` which calls `run` for cloud
    // providers. This avoids unexpected instance startups when jobs are only
    // being created in the filesystem (for example during DB migrations or
    // service redeploys).

    return true;
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    const metadata = await getJobMetadata(
      this.config.instanceRoot,
      instanceID,
      jobID
    );

    metadata.status = STATUS.Stopped;

    await writeJobMetadata(
      this.config.instanceRoot,
      instanceID,
      jobID,
      metadata
    );

    return true;
  }

  public async createWordlist(data: Buffer): Promise<string | null> {
    const wordlistID = crypto.randomUUID();

    await writeWordlistFile(this.config.wordlistRoot, wordlistID, data);

    return wordlistID;
  }

  public async createWordlistFromStream(
    stream: NodeJS.ReadableStream,
    options:
      | { originBucket?: string; originKey?: string; targetID?: string }
      | undefined
  ): Promise<string | null> {
    const desiredID = options?.targetID;
    const wordlistID = desiredID ?? crypto.randomUUID();

    // options is intentionally optional for filesystem-backed clusters; reference
    // it to avoid linter complaints when callers pass origin metadata.
    void options;

    await writeWordlistFileFromStream(
      this.config.wordlistRoot,
      wordlistID,
      stream
    );

    return wordlistID;
  }

  // Rules: store rule files on the same filesystem storage as wordlists so
  // instances can fetch them by path. Rules are simple text files for hashcat.
  public async createRule(data: Buffer): Promise<string | null> {
    const ruleID = crypto.randomUUID();

    await writeRuleFile(this.config.ruleRoot, ruleID, data);

    return ruleID;
  }

  public async createRuleFromStream(
    stream: NodeJS.ReadableStream
  ): Promise<string | null> {
    const ruleID = crypto.randomUUID();

    await writeRuleFileFromStream(this.config.ruleRoot, ruleID, stream);

    return ruleID;
  }

  public async deleteRule(ruleID: string): Promise<boolean> {
    await deleteRuleFile(this.config.ruleRoot, ruleID);
    return true;
  }

  public async listRules(): Promise<string[]> {
    const fs = await import("fs/promises");
    try {
      const files = await fs.readdir(this.config.ruleRoot);
      // Optionally filter for .rule files if needed
      return files;
    } catch {
      return [];
    }
  }

  public async deleteWordlist(wordlistID: string): Promise<boolean> {
    await deleteWordlistFile(this.config.wordlistRoot, wordlistID);
    return true;
  }
}
