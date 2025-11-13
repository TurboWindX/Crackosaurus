import { type ExternalClusterConfig } from "@repo/app-config/cluster";

import { FileSystemCluster } from "./filesystem";

export class ExternalCluster extends FileSystemCluster<ExternalClusterConfig> {
  public async listRules(): Promise<string[]> {
    // ExternalCluster stores rules locally, so delegate to FileSystemCluster
    return super.listRules();
  }
  public getName(): string {
    return "external";
  }

  public getTypes(): string[] {
    return [this.getName()];
  }

  protected async run(): Promise<void> {}

  public async createInstance(): Promise<string | null> {
    return null;
  }

  public async deleteInstance(): Promise<boolean> {
    return false;
  }
}
