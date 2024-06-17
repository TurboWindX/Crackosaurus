import fp from "fastify-plugin";

import { type ClusterTypeConfig } from "@repo/app-config/cluster";

import { buildCluster } from "../cluster";

export type ClusterPluginConfig = ClusterTypeConfig;

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    const cluster = buildCluster(options);

    server.decorate("cluster", cluster);

    server.addHook("onReady", async () => {
      if (!(await cluster.load())) throw Error("Could not load cluster config");
    });
  }
);
