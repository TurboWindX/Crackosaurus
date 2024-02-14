import { FastifyPluginCallback } from "fastify";

import { Cluster } from "../cluster/cluster";

const api: FastifyPluginCallback<{ cluster: Cluster }> = (
  instance,
  { cluster },
  next
) => {
  instance.get("/status", async () => {
    return { response: await cluster.getStatus() };
  });

  instance.post<{ Body: { instanceType?: string | null } }>(
    "/instances",
    async (request) => {
      const { instanceType } = request.body;

      return { response: await cluster.createInstance(instanceType) };
    }
  );

  instance.delete<{ Params: { instanceID: string } }>(
    "/instances/:instanceID",
    async (request) => {
      const { instanceID } = request.params;

      return { response: await cluster.deleteInstance(instanceID) };
    }
  );

  instance.post<{
    Params: { instanceID: string };
    Body: { hashType?: string; hashes?: string[] };
  }>("/instances/:instanceID/jobs", async (request) => {
    const { instanceID } = request.params;

    const { hashType, hashes } = request.body;
    if (hashType === undefined || hashes === undefined)
      return { error: "Invalid input" };

    return {
      response: await cluster.createJob(instanceID, hashType as any, hashes),
    };
  });

  instance.delete<{ Params: { instanceID: string; jobID: string } }>(
    "/instances/:instanceID/jobs/:jobID",
    async (request) => {
      const { instanceID, jobID } = request.params;

      return { response: await cluster.deleteJob(instanceID, jobID) };
    }
  );

  next();
};

export default api;
