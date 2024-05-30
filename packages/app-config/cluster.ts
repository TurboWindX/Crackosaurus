import path from "node:path";
import { z } from "zod";

import { CLUSTER_DEFAULT_PORT, DEFAULT_HOST } from "./host";
import { DEFAULT_INSTANCE_ROOT, DEFAULT_WORDLIST_ROOT } from "./path";

export const CLUSTER_TYPES = ["aws", "debug", "node"] as const;
export type ClusterType = (typeof CLUSTER_TYPES)[number];

export const CLUSTER_TYPE = {
  AWS: CLUSTER_TYPES[0],
  Debug: CLUSTER_TYPES[1],
  Node: CLUSTER_TYPES[2],
} as const;

export const AWS_CLUSTER_CONFIG = z.object({
  name: z.literal(CLUSTER_TYPE.AWS),
  imageId: z.string(),
  scriptPath: z.string(),
  hashcatPath: z.string(),
  instanceRoot: z.string(),
  wordlistRoot: z.string(),
});
export type AWSClusterConfig = z.infer<typeof AWS_CLUSTER_CONFIG>;

export const DEBUG_CLUSTER_CONFIG = z.object({
  name: z.literal(CLUSTER_TYPE.Debug),
});
export type DebugClusterConfig = z.infer<typeof DEBUG_CLUSTER_CONFIG>;

export interface FileSystemConfig {
  scriptPath: string;
  hashcatPath: string;
  instanceRoot: string;
  wordlistRoot: string;
}

export const NODE_CLUSTER_CONFIG = z.object({
  name: z.literal(CLUSTER_TYPE.Node),
  scriptPath: z.string(),
  hashcatPath: z.string(),
  instanceRoot: z.string(),
  wordlistRoot: z.string(),
});
export type NodeClusterConfig = z.infer<typeof NODE_CLUSTER_CONFIG>;

export const CLUSTER_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number(),
  }),
  type: AWS_CLUSTER_CONFIG.or(DEBUG_CLUSTER_CONFIG).or(NODE_CLUSTER_CONFIG),
});
export type ClusterConfig = z.infer<typeof CLUSTER_CONFIG>;

export function loadClusterConfig() {
  const clusterType = process.env["CLUSTER_TYPE"] ?? CLUSTER_TYPE.Debug;

  let configType;
  if (clusterType === CLUSTER_TYPE.Debug) {
    configType = { name: clusterType } satisfies DebugClusterConfig;
  } else if (clusterType === CLUSTER_TYPE.Node) {
    configType = {
      name: clusterType,
      scriptPath:
        process.env["CLUSTER_SCRIPT_PATH"] ??
        path.join("..", "instance", "dist", "index.js"),
      hashcatPath: process.env["CLUSTER_HASHCAT_PATH"] ?? "hashcat",
      instanceRoot:
        process.env["CLUSTER_INSTANCE_ROOT"] ?? DEFAULT_INSTANCE_ROOT,
      wordlistRoot:
        process.env["CLUSTER_WORDLIST_ROOT"] ?? DEFAULT_WORDLIST_ROOT,
    } satisfies NodeClusterConfig;
  } else {
    throw TypeError(`Unhandled cluster type: ${clusterType}`);
  }

  return CLUSTER_CONFIG.parse({
    host: {
      name: process.env["CLUSTER_HOST"] ?? DEFAULT_HOST,
      port: process.env["CLUSTER_PORT"]
        ? parseInt(process.env["CLUSTER_PORT"])
        : CLUSTER_DEFAULT_PORT,
    },
    type: configType,
  });
}

export function argsClusterConfig(
  config: ClusterConfig
): Record<string, string> {
  return {
    CLUSTER_PORT: config.host.port.toString(),
  };
}

export function envClusterConfig(
  config: ClusterConfig
): Record<string, string> {
  const base = {
    CLUSTER_HOST: config.host.name,
    CLUSTER_TYPE: config.type.name,
  };

  switch (config.type.name) {
    case CLUSTER_TYPE.Node:
      return {
        ...base,
        CLUSTER_SCRIPT_PATH: config.type.scriptPath,
        CLUSTER_HASHCAT_PATH: config.type.hashcatPath,
        CLUSTER_INSTANCE_ROOT: config.type.instanceRoot,
        CLUSTER_WORDLIST_ROOT: config.type.wordlistRoot,
      };

    default:
      return base;
  }
}
