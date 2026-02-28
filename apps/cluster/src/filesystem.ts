import crypto from "crypto";
import fs from "fs";
import path from "path";

import { type ClusterStatus, STATUS } from "@repo/api";
import { type FileSystemClusterConfig } from "@repo/app-config/cluster";
import {
  createClusterFolder,
  createInstanceFolder,
  createJobFolder,
  deleteInstanceFolder,
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
    console.log("[FileSystem Cluster] Creating cluster folders...");
    await createClusterFolder(this.config.instanceRoot);
    // Start periodic cleanup of stale temp files under the instance root.
    // This helps remove .tmp-* artifacts left by interrupted writers.
    void scheduleTempFileCleanup(this.config.instanceRoot);
    await createWordlistFolder(this.config.wordlistRoot);
    await createRuleFolder(this.config.ruleRoot);

    // Don't block startup on instance metadata updates - do it in background.
    // Use setImmediate so any expensive filesystem enumeration can't block Fastify startup hooks.
    console.log(
      "[FileSystem Cluster] Checking existing instances (non-blocking)..."
    );
    setImmediate(() => {
      void this.updateExistingInstancesMetadata();
    });

    console.log("[FileSystem Cluster] Filesystem cluster initialized");
    return true;
  }

  private async updateExistingInstancesMetadata(): Promise<void> {
    try {
      const instances = await getClusterFolderInstances(
        this.config.instanceRoot
      );
      console.log(
        `[FileSystem Cluster] Found ${instances.length} existing instances to check`
      );

      // First, clean up stale instances (empty jobs folders, likely from failed orchestrations)
      const staleCount = await this.cleanupStaleInstances();
      if (staleCount > 0) {
        console.log(
          `[FileSystem Cluster] Cleaned up ${staleCount} stale instance folders on startup`
        );
      }

      // Re-read after cleanup
      const remaining = await getClusterFolderInstances(
        this.config.instanceRoot
      );
      console.log(
        `[FileSystem Cluster] ${remaining.length} instances remaining after cleanup`
      );

      // Only reset instances that were RUNNING to PENDING.  After a container
      // restart nothing is actually running from the cluster's perspective, so
      // any RUNNING state is stale.  We intentionally do NOT touch instances
      // that are already Pending, Stopped, Error, or Unknown — rewriting
      // their metadata would just create hundreds of useless EFS writes.
      let resetCount = 0;
      await Promise.all(
        remaining.map(async (instanceID) => {
          try {
            const instanceMetadata = await getInstanceMetadata(
              this.config.instanceRoot,
              instanceID
            );

            // Only reset RUNNING → PENDING; leave everything else untouched
            if (instanceMetadata.status !== STATUS.Running) return;

            instanceMetadata.status = STATUS.Pending;
            await writeInstanceMetadata(
              this.config.instanceRoot,
              instanceID,
              instanceMetadata
            );
            resetCount++;
          } catch (err: unknown) {
            if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") return; // removed concurrently
            console.error(
              `[FileSystem Cluster] Failed to update metadata for instance ${instanceID}:`,
              err
            );
          }
        })
      );
      if (resetCount > 0) {
        console.log(
          `[FileSystem Cluster] Reset ${resetCount} RUNNING instances to PENDING`
        );
      }
      console.log(
        "[FileSystem Cluster] Finished updating existing instance metadata"
      );
    } catch (err) {
      console.error(
        "[FileSystem Cluster] Failed to update existing instances:",
        err
      );
    }
  }

  /**
   * Remove instance folders that are clearly stale:
   *  1. Empty (no jobs subfolder entries) AND not RUNNING, OR
   *  2. PENDING / UNKNOWN / STOPPED for longer than 24 hours, regardless of
   *     whether they still have job subfolders — these are zombies that were
   *     never backed by an actual EC2 instance.
   *
   * Returns the number of folders removed.
   */
  public async cleanupStaleInstances(): Promise<number> {
    const STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    let removed = 0;
    try {
      const instances = await getClusterFolderInstances(
        this.config.instanceRoot
      );
      console.log(
        `[FileSystem Cluster] Checking ${instances.length} instances for staleness`
      );

      for (const instanceID of instances) {
        try {
          const metadata = await getInstanceMetadata(
            this.config.instanceRoot,
            instanceID
          );

          // Never touch RUNNING instances — they might be booting / installing drivers.
          if (metadata.status === STATUS.Running) continue;

          const jobs = await getInstanceFolderJobs(
            this.config.instanceRoot,
            instanceID
          );

          // Case 1: no jobs → always remove (fast path)
          if (jobs.length === 0) {
            await deleteInstanceFolder(this.config.instanceRoot, instanceID);
            removed++;
            continue;
          }

          // Case 2: has jobs but PENDING / UNKNOWN / STOPPED for too long
          // (zombie orphan from a past orchestration cycle)
          try {
            const folderPath = path.join(this.config.instanceRoot, instanceID);
            const stat = fs.statSync(folderPath);
            const ageMs = Date.now() - stat.mtimeMs;
            if (ageMs > STALE_AGE_MS) {
              console.log(
                `[FileSystem Cluster] Removing stale instance ${instanceID} ` +
                  `(status=${metadata.status}, age=${Math.round(ageMs / 3600000)}h, jobs=${jobs.length})`
              );
              await deleteInstanceFolder(this.config.instanceRoot, instanceID);
              removed++;
            }
          } catch (statErr: unknown) {
            if (statErr instanceof Error && (statErr as NodeJS.ErrnoException).code === "ENOENT") continue;
            // Non-fatal — skip this instance
          }
        } catch (err: unknown) {
          // ENOENT / EBUSY are expected during concurrent cleanup on NFS —
          // log at debug level rather than error to avoid log spam.
          if (
            err instanceof Error && (
              (err as NodeJS.ErrnoException).code === "ENOENT" ||
              (err as NodeJS.ErrnoException).code === "EBUSY" ||
              (err as NodeJS.ErrnoException).code === "ENOTEMPTY"
            )
          ) {
            // Will be retried on the next cleanup cycle
            continue;
          }
          console.error(
            `[FileSystem Cluster] Error cleaning instance ${instanceID}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error("[FileSystem Cluster] Error during stale cleanup:", err);
    }
    return removed;
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
    console.log(`[filesystem] Deleting instance ${instanceID}`);

    try {
      // First mark as stopped
      const metadata = await getInstanceMetadata(
        this.config.instanceRoot,
        instanceID
      );
      metadata.status = STATUS.Stopped;
      await writeInstanceMetadata(
        this.config.instanceRoot,
        instanceID,
        metadata
      );
      console.log(`[filesystem] Instance ${instanceID} marked as stopped`);

      // Then actually delete the folder to free up space
      await deleteInstanceFolder(this.config.instanceRoot, instanceID);
      console.log(
        `[filesystem] Instance ${instanceID} folder deleted from EFS`
      );

      return true;
    } catch (error) {
      console.error(
        `[filesystem] Error deleting instance ${instanceID}:`,
        error
      );
      return false;
    }
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string,
    attackMode?: number,
    mask?: string
  ): Promise<string | null> {
    console.log(`[Cluster] createJob called with instanceID: ${instanceID}`);
    const jobID = crypto.randomUUID();

    return (await this.createJobWithID(
      instanceID,
      jobID,
      wordlist,
      hashType,
      hashes,
      rule,
      attackMode,
      mask,
      undefined
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
    rule?: string,
    attackMode?: number,
    mask?: string,
    ntWordlist?: string[]
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
      attackMode,
      mask,
      ntWordlist,
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
