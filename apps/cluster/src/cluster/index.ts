import { CLUSTER_TYPE, ClusterTypeConfig } from "@repo/app-config/cluster";

import { AWSCluster } from "./aws";
import { Cluster } from "./cluster";
import { DebugCluster } from "./debug";
import { ExternalCluster } from "./external";
import { NodeCluster } from "./node";

export function buildCluster(options: ClusterTypeConfig): Cluster<any> {
  switch (options.name) {
    case CLUSTER_TYPE.AWS:
      return new AWSCluster(options);
    case CLUSTER_TYPE.Debug:
      return new DebugCluster(options);
    case CLUSTER_TYPE.External:
      return new ExternalCluster(options);
    case CLUSTER_TYPE.Node:
      return new NodeCluster(options);
  }
}
