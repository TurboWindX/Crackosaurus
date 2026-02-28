import fp from "fastify-plugin";

import { type ClusterTypeConfig } from "@repo/app-config/cluster";

import { buildCluster } from "../cluster-factory";

export type ClusterPluginConfig = ClusterTypeConfig;

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    const cluster = buildCluster(options);

    server.decorate("cluster", cluster);

    server.addHook("onReady", async () => {
      const timeoutMs = 8000;
      const loaded = await Promise.race([
        cluster.load(),
        new Promise<boolean>((resolve) =>
          setTimeout(() => {
            console.error(
              `[Cluster] cluster.load() timed out after ${timeoutMs}ms; continuing startup best-effort`
            );
            resolve(false);
          }, timeoutMs)
        ),
      ]);

      if (!loaded) {
        console.warn(
          "[Cluster] Proceeding without confirmed cluster load (will retry lazily)"
        );
      }
    });
  }
);
