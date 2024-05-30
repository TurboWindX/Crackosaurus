import fp from "fastify-plugin";

import { type ClusterConfig } from "@repo/app-config/cluster";

import { AWSCluster } from "../cluster/aws";
import { Cluster } from "../cluster/cluster";
import { DebugCluster } from "../cluster/debug";
import { NodeCluster } from "../cluster/node";

export type ClusterPluginConfig = ClusterConfig["type"];

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let cluster: Cluster<any>;

    if (options.name === "aws") {
      cluster = new AWSCluster(options);
    } else if (options.name === "debug") {
      cluster = new DebugCluster(options);
    } else if (options.name === "node") {
      cluster = new NodeCluster(options);
    } else {
      throw new TypeError("Unhandled cluster type");
    }

    server.decorate("cluster", cluster);

    server.addHook("onReady", async () => {
      if (!(await cluster.load())) throw Error("Could not load cluster config");
    });
  }
);
