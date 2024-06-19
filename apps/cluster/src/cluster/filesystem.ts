import crypto from "node:crypto";

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
} from "@repo/filesystem/cluster";
import { createWordlistFolder } from "@repo/filesystem/wordlist";
import { type HashType } from "@repo/hashcat/data";

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
    const metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );

    if (metadata.status === STATUS.Unknown) return true;

    metadata.status = STATUS.Stopped;

    await writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    return true;
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<string | null> {
    const jobID = crypto.randomUUID();

    await createJobFolder(this.config.instanceRoot, instanceID, jobID, {
      wordlist,
      hashes,
      hashType,
    });

    const instanceMetadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );

    if (instanceMetadata.status === STATUS.Pending) await this.run(instanceID);

    return jobID;
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    const metadata = await getJobMetadata(
      this.config.instanceRoot,
      instanceID,
      jobID
    );

    if (metadata.status === STATUS.Unknown) return true;

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

  public async deleteWordlist(wordlistID: string): Promise<boolean> {
    await deleteWordlistFile(this.config.wordlistRoot, wordlistID);

    return true;
  }
}
