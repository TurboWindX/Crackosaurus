import child_process from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type ClusterStatus, type Status } from "@repo/api";
import { type FileSystemClusterConfig } from "@repo/app-config/cluster";
import { type HashType } from "@repo/hashcat/data";
import { hashcat, readHashcatPot } from "@repo/hashcat/exe";

import { STATUS } from "../../../../packages/api/src/types";
import { Cluster } from "./cluster";

interface InstanceMetadata {
  status: Status;
}

interface JobMetadata {
  instanceID: string;
  status: Status;
  hashType: HashType;
  wordlist: string;
}

class MetadataFile<TData extends Record<string, any>> {
  private static readonly METADATA_FILE = "metadata.json";

  public constructor(
    public readonly folder: string,
    public data: TData = null as unknown as TData
  ) {}

  public read(): TData | null {
    const metadataFile = path.join(this.folder, MetadataFile.METADATA_FILE);

    if (!fs.existsSync(metadataFile)) return null;
    this.data = JSON.parse(
      fs.readFileSync(metadataFile, { encoding: "utf-8" })
    );

    return this.data;
  }

  public write(): boolean {
    const metadataFile = path.join(this.folder, MetadataFile.METADATA_FILE);
    if (!this.data) return false;

    fs.writeFileSync(metadataFile, JSON.stringify(this.data));

    return true;
  }
}

export class FileSystemCluster extends Cluster<FileSystemClusterConfig> {
  private status: ClusterStatus = { instances: {} };

  private instanceMetadatas: Record<string, MetadataFile<InstanceMetadata>> =
    {};
  private jobMetadatas: Record<string, MetadataFile<JobMetadata>> = {};

  private jobHashes: Record<string, Record<string, string>> = {};
  private runningJobs: Record<
    string,
    child_process.ChildProcessWithoutNullStreams
  > = {};

  public async load(): Promise<boolean> {
    if (this.config.exePath && !fs.existsSync(this.config.exePath))
      return false;

    const instanceFolder = path.join(this.config.rootFolder, "instances");
    if (!fs.existsSync(instanceFolder))
      fs.mkdirSync(instanceFolder, {
        recursive: true,
      });

    [this.instanceMetadatas, this.jobMetadatas, this.jobHashes] =
      await this.loadFromDisk();
    this.refreshStatus();

    return true;
  }

  private async loadFromDisk(): Promise<
    [
      typeof this.instanceMetadatas,
      typeof this.jobMetadatas,
      typeof this.jobHashes,
    ]
  > {
    const instancesFolder = path.join(this.config.rootFolder, "instances");

    const instancesFiles = fs.readdirSync(instancesFolder, {
      withFileTypes: true,
    });
    const instanceIDs = instancesFiles
      .filter((file) => file.isDirectory())
      .map((file) => file.name);

    const instanceMetadatas: typeof this.instanceMetadatas = {};
    const jobMetadatas: typeof this.jobMetadatas = {};
    const jobHashes: typeof this.jobHashes = {};

    for (const instanceID of instanceIDs) {
      const instanceFolder = path.join(instancesFolder, instanceID);

      const instanceMetadata = new MetadataFile<InstanceMetadata>(
        instanceFolder
      );
      if (!instanceMetadata.read()) continue;
      instanceMetadatas[instanceID] = instanceMetadata;

      const instanceFiles = fs.readdirSync(instanceFolder, {
        withFileTypes: true,
      });

      const jobIDs = instanceFiles
        .filter((file) => file.isDirectory())
        .map((file) => file.name);

      for (const jobID of jobIDs) {
        const jobFolder = path.join(instanceFolder, jobID);

        jobHashes[jobID] = readHashcatPot(path.join(jobFolder, "output.pot"));

        const jobMetadata = new MetadataFile<JobMetadata>(jobFolder);
        if (!jobMetadata.read()) continue;
        jobMetadatas[jobID] = jobMetadata;
      }
    }

    return [instanceMetadatas, jobMetadatas, jobHashes];
  }

  private refreshStatus() {
    const status: ClusterStatus = { instances: {} };

    for (const [instanceID, metadata] of Object.entries(
      this.instanceMetadatas
    )) {
      status.instances[instanceID] = {
        status: metadata.data.status,
        jobs: {},
      };
    }

    for (const [jobID, metadata] of Object.entries(this.jobMetadatas)) {
      const instanceStatus = status.instances[metadata.data.instanceID];
      if (!instanceStatus) continue;

      instanceStatus.jobs[jobID] = {
        status: metadata.data.status,
        hashes: this.jobHashes[jobID] ?? {},
      };
    }

    this.status = status;
  }

  public async tick(): Promise<void> {
    if ((await this.tickRunningJobs()) || (await this.tickJobs()))
      this.refreshStatus();
  }

  private async tickRunningJobs(): Promise<boolean> {
    let isDirty = false;
    for (const [jobID, process] of Object.entries(this.runningJobs)) {
      const jobMetadata = this.jobMetadatas[jobID];
      if (!jobMetadata) continue;

      const jobFolder = path.join(
        this.config.rootFolder,
        "instances",
        jobMetadata.data.instanceID,
        jobID
      );
      if (!jobFolder) continue;

      const exitCode = process.exitCode;
      if (exitCode === null) continue;

      let status: Status;
      if (exitCode >= 0) status = STATUS.Complete;
      else status = STATUS.Error;
      jobMetadata.data.status = status;

      jobMetadata.write();

      isDirty = true;

      delete this.runningJobs[jobID];
    }

    return isDirty;
  }

  private async tickJobs(): Promise<boolean> {
    await this.tickRunningJobs();

    const runningInstances = new Set<string>();

    let isDirty = false;
    for (const [jobID, jobMetadata] of Object.entries(this.jobMetadatas)) {
      const jobFolder = path.join(
        this.config.rootFolder,
        "instances",
        jobMetadata.data.instanceID,
        jobID
      );

      this.jobHashes[jobID] = readHashcatPot(
        path.join(jobFolder, "output.pot")
      );

      switch (jobMetadata.data.status) {
        case STATUS.Pending:
          jobMetadata.data.status = STATUS.Running;
          isDirty = true;

          this.runningJobs[jobID] = hashcat({
            exePath: this.config.exePath,
            hashType: jobMetadata.data.hashType,
            inputFile: path.join(jobFolder, "hashes.txt"),
            outputFile: path.join(jobFolder, "output.pot"),
            wordlistFile: jobMetadata.data.wordlist,
          });

        case STATUS.Running:
          runningInstances.add(jobMetadata.data.instanceID);
          break;
      }
    }

    for (const [instanceID, instanceMetadata] of Object.entries(
      this.instanceMetadatas
    )) {
      if (instanceMetadata.data.status === STATUS.Stopped) continue;

      const isRunning = runningInstances.has(instanceID);

      const status = instanceMetadata.data.status;
      if (status === STATUS.Running && !isRunning) {
        instanceMetadata.data.status = STATUS.Pending;
        isDirty = true;
      } else if (status === STATUS.Pending && isRunning) {
        instanceMetadata.data.status = STATUS.Running;
        isDirty = true;
      }
    }

    return isDirty;
  }

  public async createInstance(_instanceType?: string): Promise<string | null> {
    const instanceID = crypto.randomUUID();

    const instanceFolder = path.join(
      this.config.rootFolder,
      "instances",
      instanceID
    );
    fs.mkdirSync(instanceFolder, {
      recursive: true,
    });

    const instanceMetadata = new MetadataFile<InstanceMetadata>(
      instanceFolder,
      {
        status: STATUS.Pending,
      }
    );
    this.instanceMetadatas[instanceID] = instanceMetadata;
    instanceMetadata.write();

    this.refreshStatus();

    return instanceID;
  }

  public async createJob(
    instanceID: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<string | null> {
    const jobID = crypto.randomUUID();

    const instanceFolder = path.join(
      this.config.rootFolder,
      "instances",
      instanceID
    );
    if (!fs.existsSync(instanceFolder)) return null;

    const jobFolder = path.join(instanceFolder, jobID);
    fs.mkdirSync(jobFolder);

    const hashesFile = path.join(jobFolder, "hashes.txt");
    fs.writeFileSync(hashesFile, hashes.join("\n"));

    const jobMetadata = new MetadataFile<JobMetadata>(jobFolder, {
      status: STATUS.Pending,
      instanceID,
      hashType,
      wordlist: this.config.wordlistPath,
    });
    this.jobMetadatas[jobID] = jobMetadata;
    jobMetadata.write();

    this.refreshStatus();

    return jobID;
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    const jobFolder = path.join(
      this.config.rootFolder,
      "instances",
      instanceID,
      jobID
    );
    if (!fs.existsSync(jobFolder)) return false;

    fs.rmSync(jobFolder, {
      recursive: true,
      force: true,
    });

    delete this.jobMetadatas[jobID];

    const process = this.runningJobs[jobID];
    if (process) {
      process.kill();
      delete this.runningJobs[jobID];
    }

    this.refreshStatus();

    return true;
  }

  public async getStatus(): Promise<ClusterStatus> {
    return this.status;
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    const instanceFolder = path.join(
      this.config.rootFolder,
      "instances",
      instanceID
    );
    if (!fs.existsSync(instanceFolder)) return false;

    const instanceFiles = fs.readdirSync(instanceFolder, {
      withFileTypes: true,
    });

    const jobs = instanceFiles
      .filter((file) => file.isDirectory())
      .map((file) => file.name);
    for (const jobID of jobs) {
      delete this.jobMetadatas[jobID];

      const process = this.runningJobs[jobID];
      if (process) {
        process.kill();
        delete this.runningJobs[jobID];
      }
    }

    fs.rmSync(instanceFolder, {
      recursive: true,
      force: true,
    });

    this.refreshStatus();

    return true;
  }
}
