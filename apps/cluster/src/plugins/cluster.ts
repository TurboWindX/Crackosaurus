import { FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

import { Cluster } from "../cluster/cluster";
import { DebugCluster } from "../cluster/debug";
import { FileSystemCluster, type FileSystemClusterConfig } from "../cluster/fs";

interface ClusterPluginBaseConfig extends FastifyPluginOptions {}

interface ClusterDebugConfig extends ClusterPluginBaseConfig {
  debug: boolean;
}

interface ClusterFileSystemConfig extends ClusterPluginBaseConfig {
  fileSystem: FileSystemClusterConfig;
}

export type ClusterPluginConfig = ClusterDebugConfig | ClusterFileSystemConfig;

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let cluster: Cluster<any>;

    if (options.fileSystem) {
      cluster = new FileSystemCluster(options.fileSystem);
    } else {
      cluster = new DebugCluster(undefined);
    }

    server.decorate("cluster", cluster);

    let interval: NodeJS.Timeout | null = null;

    server.addHook("onReady", async () => {
      await cluster.load();

      interval = setInterval(() => {
        cluster.tick();
      }, 1000);
    });

    server.addHook("onClose", async () => {
      if (interval) clearInterval(interval);
    });
  }
);
