import http from "node:http";

import { type ClusterStatus, type HashType } from "@repo/api";

import { ClusterConnector } from "./connector";

export interface HTTPClusterConnectorConfig {
  host: string;
  port: number;
}

export class HTTPClusterConnector extends ClusterConnector<HTTPClusterConnectorConfig> {
  public async load(): Promise<boolean> {
    return true;
  }

  private request<TReq, TRes>(
    method: string,
    path: string,
    data?: TReq
  ): Promise<{ response?: TRes; error?: any }> {
    const raw = data ? JSON.stringify(data) : undefined;

    return new Promise((resolve, reject) => {
      let output = "";

      const req = http.request(
        {
          host: this.config.host,
          port: this.config.port,
          path,
          method,
          headers:
            raw === undefined
              ? undefined
              : {
                  "Content-Type": "application/json",
                  "Content-Length": raw.length,
                },
        },
        (res) => {
          res.on("data", (chunk) => (output += chunk));
          res.on("end", () => resolve(JSON.parse(output)));
        }
      );

      req.on("error", (e) => resolve({ error: e }));

      if (raw) req.write(raw);

      req.end();
    });
  }

  private get<TRes>(path: string) {
    return this.request<any, TRes>("GET", path);
  }

  private post<TRes, TReq = any>(path: string, data?: TReq) {
    return this.request<any, TRes>("POST", path, data);
  }

  private delete(path: string) {
    return this.request<any, boolean>("DELETE", path);
  }

  public async getStatus() {
    const res = await this.get<ClusterStatus>("/status");
    if (res.response === undefined) return null;

    return res.response;
  }

  public async createInstance(
    instanceType?: string | null
  ): Promise<string | null> {
    const res = await this.post<string>("/instances", { instanceType });
    if (res.response === undefined) return null;

    return res.response;
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    const res = await this.delete(`/instances/${instanceID}`);
    if (res.response === undefined) return false;

    return res.response;
  }

  public async createJob(
    instanceID: string,
    hashType: HashType,
    hashes: string[]
  ): Promise<string | null> {
    const res = await this.post<string>(`/instances/${instanceID}/jobs`, {
      hashType,
      hashes,
    });
    if (res.response === undefined) return null;

    return res.response;
  }

  public async deleteJob(instanceID: string, jobID: string): Promise<boolean> {
    const res = await this.delete(`/instances/${instanceID}/${jobID}`);
    if (res.response === undefined) return false;

    return res.response;
  }
}
