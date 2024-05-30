import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type ClusterStatus, STATUS } from "@repo/api";
import { type FileSystemConfig } from "@repo/app-config/cluster";
import {
  createClusterFolder,
  createInstanceFolder,
  createJobFolder,
  getClusterFolderInstances,
  getClusterFolderStatus,
  getInstanceFolderJobs,
  getInstanceMetadata,
  getJobMetadata,
  writeInstanceMetadata,
  writeJobMetadata,
} from "@repo/filesystem/cluster";
import { createWordlistFolder } from "@repo/filesystem/wordlist";
import { type HashType } from "@repo/hashcat/data";

import { Cluster } from "./cluster";

export abstract class FileSystemCluster<
  TConfig extends FileSystemConfig,
> extends Cluster<TConfig> {
  protected abstract run(instanceID: string): Promise<void>;

  public async load(): Promise<boolean> {
    if (
      path.dirname(this.config.hashcatPath) !== "." &&
      !fs.existsSync(this.config.hashcatPath)
    )
      return false;

    createClusterFolder(this.config.instanceRoot);
    createWordlistFolder(this.config.wordlistRoot);

    Promise.all(
      getClusterFolderInstances(this.config.instanceRoot).map(
        async (instanceID) => {
          const instanceMetadata = getInstanceMetadata(
            this.config.instanceRoot,
            instanceID
          );
          if (instanceMetadata.status === STATUS.Stopped) return;
          instanceMetadata.status = STATUS.Pending;

          writeInstanceMetadata(
            this.config.instanceRoot,
            instanceID,
            instanceMetadata
          );

          const activeJobs = getInstanceFolderJobs(
            this.config.instanceRoot,
            instanceID
          ).some((jobID) => {
            const jobMetadata = getJobMetadata(
              this.config.instanceRoot,
              instanceID,
              jobID
            );
            return !(
              jobMetadata.status === STATUS.Complete ||
              jobMetadata.status === STATUS.Stopped
            );
          });

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

    createInstanceFolder(this.config.instanceRoot, instanceID, {
      type: instanceType,
    });

    return instanceID;
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    const metadata = getInstanceMetadata(this.config.instanceRoot, instanceID);

    if (metadata.status === STATUS.Unknown) return true;

    metadata.status = STATUS.Stopped;

    writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    return true;
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<string | null> {
    const jobID = crypto.randomUUID();

    createJobFolder(this.config.instanceRoot, instanceID, jobID, {
      wordlist,
      hashes,
      hashType,
    });

    const instanceMetadata = getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );

    if (instanceMetadata.status === STATUS.Pending) await this.run(instanceID);

    return jobID;
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    const metadata = getJobMetadata(
      this.config.instanceRoot,
      instanceID,
      jobID
    );

    if (metadata.status === STATUS.Unknown) return true;

    metadata.status = STATUS.Stopped;

    writeJobMetadata(this.config.instanceRoot, instanceID, jobID, metadata);

    return true;
  }
}
