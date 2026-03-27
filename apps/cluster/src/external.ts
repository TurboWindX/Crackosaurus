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

  public async createInstanceFolder(
    instanceType: string
  ): Promise<string | null> {
    const instanceID = await super.createInstanceFolder(instanceType);

    if (!instanceID) {
      console.log(
        `[External Cluster] Failed to create instance folder for type ${instanceType}`
      );
      return null;
    }

    return instanceID;
  }

  public async createInstance(): Promise<string | null> {
    const instanceID = await this.createInstanceFolder("external");
    if (!instanceID) return null;

    await this.launchInstance(instanceID);
    return instanceID;
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    console.log(
      `[External Cluster] deleteInstance() called for instanceID: ${instanceID}`
    );
    return await super.deleteInstance(instanceID);
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string,
    attackMode?: number,
    mask?: string
  ): Promise<string | null> {
    // Call parent to create job folder and metadata. Instance will scam
    // EFS to find it.
    const jobID = await super.createJob(
      instanceID,
      wordlist,
      hashType,
      hashes,
      rule,
      attackMode,
      mask
    );

    if (!jobID) {
      console.log(
        `[External Cluster] Failed to create job for instance ${instanceID}`
      );
      return null;
    }

    return jobID;
  }

  public async createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string,
    attackMode?: number,
    mask?: string,
    ntWordlist?: string[]
  ): Promise<boolean> {
    // Call parent to create job folder and metadata with specified ID
    const result = await super.createJobWithID(
      instanceID,
      jobID,
      wordlist,
      hashType,
      hashes,
      rule,
      attackMode,
      mask,
      ntWordlist
    );

    if (!result) {
      console.log(
        `[External Cluster] Failed to create job ${jobID} for instance ${instanceID}`
      );
      return false;
    }

    return true;
  }
}
