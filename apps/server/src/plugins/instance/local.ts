import child_process from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type HashType } from "@repo/api";

import { getHashcatMode } from "./hashcat";
import { InstanceAPI } from "./instance";

export interface LocalInstanceAPIConfig {
  exePath: string;
  rootFolder: string;
  wordlistPath: string;
}

export class LocalInstanceAPI extends InstanceAPI<LocalInstanceAPIConfig> {
  private readonly instances: Record<
    string,
    Record<string, child_process.ChildProcessWithoutNullStreams>
  > = {};

  public async load(): Promise<boolean> {
    if (!fs.existsSync(this.config.rootFolder)) return false;
    if (this.config.exePath && !fs.existsSync(this.config.exePath))
      return false;

    const instanceFolder = path.join(this.config.rootFolder, "instances");
    if (!fs.existsSync(instanceFolder)) fs.mkdirSync(instanceFolder);

    return true;
  }

  public async create(_instanceType?: string): Promise<string | null> {
    const uuid = crypto.randomUUID();

    const instanceFolder = path.join(this.config.rootFolder, "instances", uuid);
    fs.mkdirSync(instanceFolder);

    this.instances[uuid] = {};

    return uuid;
  }

  public async queue(
    instanceId: string,
    jobId: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<boolean> {
    const instance = this.instances[instanceId];
    if (instance === undefined) return false;

    const exe = path.basename(this.config.exePath);
    const exeCwd = path.dirname(this.config.exePath);

    const instanceFolder = path.join(
      this.config.rootFolder,
      "instances",
      instanceId
    );
    const jobFolder = path.join(instanceFolder, jobId);

    const hashesFile = path.join(jobFolder, "hashes.txt");
    fs.writeFileSync(hashesFile, hashes.join("\n"));

    const outputFile = path.join(jobFolder, "output.txt");

    const wordlistFile = this.config.wordlistPath;

    const process = child_process.spawn(
      exe,
      [
        "-a 0",
        `-m ${getHashcatMode(hashType)}`,
        `-o ${outputFile}`,
        hashesFile,
        wordlistFile,
      ],
      {
        cwd: exeCwd,
      }
    );

    instance[jobId] = process;

    return true;
  }

  public async dequeue(instanceId: string, jobId: string): Promise<boolean> {
    const instance = this.instances[instanceId];
    if (instance === undefined) return false;

    const process = instance[jobId];
    if (process === undefined) return false;

    process.kill();

    delete instance[jobId];

    return true;
  }

  public async terminate(instanceId: string): Promise<boolean> {
    const instance = this.instances[instanceId];
    if (instance === undefined) return false;

    Object.values(instance).map((process) => {
      process.kill();
    });

    delete this.instances[instanceId];

    return true;
  }
}
