import { type ExternalClusterConfig } from "@repo/app-config/cluster";

import { FileSystemCluster } from "./filesystem";

export class ExternalCluster extends FileSystemCluster<ExternalClusterConfig> {
  protected async run(_instanceID: string): Promise<void> {}

  public async createInstance(_instanceType: string): Promise<string | null> {
    return null;
  }

  public async deleteInstance(_instanceID: string): Promise<boolean> {
    return false;
  }
}
