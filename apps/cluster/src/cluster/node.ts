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
  public getName(): string {
    return "node";
  }

  protected async run(instanceID: string): Promise<void> {
    const metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );
    metadata.status = STATUS.Running;

    writeInstanceMetadata(this.config.instanceRoot, instanceID, metadata);

    childProcess.spawn("node", [this.config.scriptPath], {
      env: envInstanceConfig({
        instanceID,
        ...this.config,
      }),
      stdio: "inherit",
    });
  }
}
