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
import { createWordlistFolder } from "@repo/filesystem/wordlist";

import { Cluster } from "./cluster";

export abstract class FileSystemCluster<
  TConfig extends FileSystemClusterConfig,
> extends Cluster<TConfig> {
  protected abstract run(instanceID: string): Promise<void>;

  public async load(): Promise<boolean> {
    await createClusterFolder(this.config.instanceRoot);
    await createWordlistFolder(this.config.wordlistRoot);

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

          const activeJobs = (
            await Promise.all(
              (
                await getInstanceFolderJobs(
                  this.config.instanceRoot,
                  instanceID
                )
              ).map(async (jobID) => {
                const jobMetadata = await getJobMetadata(
                  this.config.instanceRoot,
                  instanceID,
                  jobID
                );

                return !(
                  jobMetadata.status === STATUS.Complete ||
                  jobMetadata.status === STATUS.Stopped
                );
              })
            )
          ).some((_) => _);

          if (activeJobs) await this.run(instanceID);
        }
      )
    );

    return true;
  }

  public async getStatus(): Promise<ClusterStatus> {
    return getClusterFolderStatus(this.config.instanceRoot);
  }

  public async createInstance(instanceType: string): Promise<string | null> {
    const instanceID = crypto.randomUUID();

    await createInstanceFolder(this.config.instanceRoot, instanceID, {
      type: instanceType,
    });

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
    hashes: string[]
  ): Promise<string | null> {
    console.log(`[Cluster] createJob called with instanceID: ${instanceID}`);
    const jobID = crypto.randomUUID();

    return (await this.createJobWithID(
      instanceID,
      jobID,
      wordlist,
      hashType,
      hashes
    ))
      ? jobID
      : null;
  }

  public async createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[]
  ): Promise<boolean> {
    console.log(
      `[Cluster] createJobWithID called with instanceID: ${instanceID}, jobID: ${jobID}`
    );

    await createJobFolder(this.config.instanceRoot, instanceID, jobID, {
      wordlist,
      hashes,
      hashType,
    });
    console.log(
      `[Cluster] Job ${jobID} created in ${this.config.instanceRoot}/${instanceID}/jobs/`
    );

    const instanceMetadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );
    console.log(
      `[Cluster] Instance ${instanceID} metadata:`,
      JSON.stringify(instanceMetadata)
    );

    // Launch GPU worker if instance is not currently running
    // This allows re-launching workers for instances that completed/stopped
    if (
      instanceMetadata.status !== STATUS.Running &&
      instanceMetadata.status !== STATUS.Error
    ) {
      console.log(
        `[Cluster] Auto-launching GPU worker for instance ${instanceID} (status: ${instanceMetadata.status}, type: ${instanceMetadata.type})`
      );
      await this.run(instanceID);
    }

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
    options: { originBucket?: string; originKey?: string } | undefined
  ): Promise<string | null> {
    const wordlistID = crypto.randomUUID();

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

  public async deleteWordlist(wordlistID: string): Promise<boolean> {
    await deleteWordlistFile(this.config.wordlistRoot, wordlistID);

    return true;
  }
}
