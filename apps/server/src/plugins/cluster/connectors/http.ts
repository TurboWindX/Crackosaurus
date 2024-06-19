import { type Readable } from "node:stream";

import { type APIType } from "@repo/api/cluster";
import { makeAPI } from "@repo/api/cluster/client/node";
import { type HashType } from "@repo/hashcat/data";

import { ClusterConnector } from "./connector";

export interface HTTPClusterConnectorConfig {
  url: string;
}

export class HTTPClusterConnector extends ClusterConnector<HTTPClusterConnectorConfig> {
  private API!: APIType;

  public async load(): Promise<boolean> {
    this.API = makeAPI(this.config.url);

    return true;
  }

  public async getStatus() {
    try {
      return this.API.status({});
    } catch (e) {
      return null;
    }
  }

  public async createInstance(
    instanceType?: string | null
  ): Promise<string | null> {
    try {
      return await this.API.createInstance({ instanceType });
    } catch (e) {
      return null;
    }
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    try {
      return await this.API.deleteInstance({ instanceID });
    } catch (e) {
      return false;
    }
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<string | null> {
    try {
      return await this.API.createJob({
        instanceID,
        wordlist,
        hashType,
        hashes,
      });
    } catch (e) {
      return null;
    }
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    try {
      return await this.API.deleteJob({
        instanceID,
        jobID,
      });
    } catch (e) {
      return false;
    }
  }

  public async createWordlist(buffer: Buffer): Promise<string | null> {
    try {
      const formData = new FormData();

      formData.set("data", new Blob([buffer], { type: "text/plain" }));

      return await this.API.createWordlist(formData);
    } catch (e) {
      return null;
    }
  }

  public async deleteWordlist(wordlistID: string): Promise<boolean> {
    try {
      return await this.API.deleteWordlist({ wordlistID });
    } catch (e) {
      return false;
    }
  }
}
