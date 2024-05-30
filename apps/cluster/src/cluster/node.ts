import childProcess from "node:child_process";

import { STATUS } from "@repo/api";
import { type NodeClusterConfig } from "@repo/app-config/cluster";
import { envInstanceConfig } from "@repo/app-config/instance";
import {
  getInstanceMetadata,
  writeInstanceMetadata,
} from "@repo/filesystem/cluster";

import { FileSystemCluster } from "./filesystem";

export class NodeCluster extends FileSystemCluster<NodeClusterConfig> {
  protected async run(instanceID: string): Promise<void> {
    const metadata = getInstanceMetadata(this.config.instanceRoot, instanceID);
    metadata.status = STATUS.Running;

    writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    childProcess.spawn("node", [this.config.scriptPath], {
      env: envInstanceConfig({
        instanceID,
        instanceRoot: this.config.instanceRoot,
        hashcatPath: this.config.hashcatPath,
        wordlistRoot: this.config.wordlistRoot,
      }),
      stdio: "inherit",
    });
  }
}
