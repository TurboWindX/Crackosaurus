import { InstanceAPI } from "./instance";
import child_process from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type HashType } from "@repo/api";
import { getHashcatMode } from "./hashcat";

export interface LocalInstanceAPIConfig {
    exePath: string;
    rootFolder: string;
    wordlistPath: string;
}

export class LocalInstanceAPI extends InstanceAPI<LocalInstanceAPIConfig> {
    private readonly insanceConfigs: Record<string, string[]> = {};
    private readonly instances: Record<string, child_process.ChildProcessWithoutNullStreams> = {};

    public async load(): Promise<boolean> {
        if (!fs.existsSync(this.config.rootFolder)) return false;
        if (this.config.exePath && !fs.existsSync(this.config.exePath)) return false;

        const instanceFolder = path.join(this.config.rootFolder, "instances");
        if (!fs.existsSync(instanceFolder)) fs.mkdirSync(instanceFolder);

        return true;
    }

    public async create(hashType: HashType, hashes: string[], _instanceType?: string): Promise<string | null> {
        const uuid = crypto.randomUUID();

        const instanceFolder = path.join(this.config.rootFolder, "instances", uuid);
        fs.mkdirSync(instanceFolder);

        const hashesFile = path.join(instanceFolder, "hashes.txt");
        fs.writeFileSync(hashesFile, hashes.join("\n"));

        const outputFile = path.join(instanceFolder, "output.txt");

        const wordlistFile = this.config.wordlistPath;

        this.insanceConfigs[uuid] = ["-a 0", `-m ${getHashcatMode(hashType)}`, `-o ${outputFile}`, hashesFile, wordlistFile];

        return uuid;
    }

    public async start(instanceId: string): Promise<boolean> {
        const config = this.insanceConfigs[instanceId];
        if (!config) return false;

        const exe = path.basename(this.config.exePath);
        const exeCwd = path.dirname(this.config.exePath);

        const instance = child_process.spawn(exe, config, {
            cwd: exeCwd
        });

        this.instances[instanceId] = instance;

        delete this.insanceConfigs[instanceId];

        return true;
    }

    public async stop(instanceId: string): Promise<boolean> {
        const instance = this.instances[instanceId];
        if (!instance) return false;

        instance.kill();

        return true;
    }

    public async terminate(instanceId: string): Promise<boolean> {
        const instance = this.instances[instanceId];
        if (!instance) return false;

        if (!instance.killed) instance.kill();

        delete this.instances[instanceId];

        return true;
    }
}