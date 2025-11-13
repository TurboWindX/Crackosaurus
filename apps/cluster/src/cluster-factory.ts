import {
  type AWSClusterConfig,
  type ClusterTypeConfig,
  type ExternalClusterConfig,
  type NodeClusterConfig,
} from "@repo/app-config/cluster";

// NOTE: The factory is kept in its own module to avoid a circular import
// cycle during module initialization. Historically the `Cluster` abstract
// class exported a factory that directly imported concrete implementations
// (AwsCluster, FileSystemCluster, etc.). That created a cycle
// (cluster -> aws-cluster -> filesystem -> cluster) which confused bundlers
// and produced warnings. Moving the factory here ensures the abstract class
// module doesn't import concrete implementations and keeps the dependency
// graph acyclic.
import { AwsCluster } from "./aws-cluster";
import { type Cluster } from "./cluster";
import { ExternalCluster } from "./external";
import { FileSystemCluster } from "./filesystem";
import { NodeCluster } from "./node";

export function buildCluster(config: ClusterTypeConfig): Cluster<unknown> {
  switch (config.name) {
    case "aws":
      return new AwsCluster(config as unknown as AWSClusterConfig);
    case "node":
      return new NodeCluster(config as unknown as NodeClusterConfig);
    case "external":
      return new ExternalCluster(config as unknown as ExternalClusterConfig);
    default:
      return new (FileSystemCluster as unknown as {
        new (c: unknown): Cluster<unknown>;
      })(config);
  }
}
