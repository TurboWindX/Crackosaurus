import fp from "fastify-plugin";

import { ClusterConfig } from "@repo/app-config";

import { AWSCluster } from "../cluster/aws";
import { Cluster } from "../cluster/cluster";
import { DebugCluster } from "../cluster/debug";
import { FileSystemCluster } from "../cluster/fs";

export type ClusterPluginConfig = ClusterConfig["type"];

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let cluster: Cluster<any>;

    if (options.name === "aws") {
      cluster = new AWSCluster(options);
    } else if (options.name === "debug") {
      cluster = new DebugCluster(options);
    } else if (options.name === "filesystem") {
      cluster = new FileSystemCluster(options);
    } else {
      throw new TypeError("Unhandled cluster type");
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
