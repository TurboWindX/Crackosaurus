import path from "path";
import { z } from "zod";

import { CLUSTER_DEFAULT_PORT, DEFAULT_HOST } from "./host";
import { DEFAULT_INSTANCE_ROOT, DEFAULT_WORDLIST_ROOT } from "./path";

const CLUSTER_ENV = {
  clusterHost: "CLUSTER_HOST",
  clusterPort: "CLUSTER_PORT",
  clusterType: "CLUSTER_TYPE",
  scriptPath: "CLUSTER_SCRIPT_PATH",
  hashcatPath: "CLUSTER_HASHCAT_PATH",
  instanceRoot: "CLUSTER_INSTANCE_ROOT",
  wordlistRoot: "CLUSTER_WORDLIST_ROOT",
  instanceInterval: "CLUSTER_INSTANCE_INTERVAL",
  instanceCooldown: "CLUSTER_INSTANCE_COOLDOWN",
  stepFunctionArn: "CLUSTER_STEP_FUNCTION",
} as const;

export const CLUSTER_TYPES = ["aws", "debug", "external", "node"] as const;
export type ClusterType = (typeof CLUSTER_TYPES)[number];

export const CLUSTER_TYPE = {
  AWS: CLUSTER_TYPES[0],
  Debug: CLUSTER_TYPES[1],
  External: CLUSTER_TYPES[2],
  Node: CLUSTER_TYPES[3],
} as const;

const FILESYSTEM_CLUSTER_CONFIG = z.object({
  instanceRoot: z.string(),
  wordlistRoot: z.string(),
});
export type FileSystemClusterConfig = z.infer<typeof FILESYSTEM_CLUSTER_CONFIG>;

export const AWS_CLUSTER_CONFIG = z
  .object({
    name: z.literal(CLUSTER_TYPE.AWS),
    stepFunctionArn: z.string(),
  })
  .and(FILESYSTEM_CLUSTER_CONFIG);
export type AWSClusterConfig = z.infer<typeof AWS_CLUSTER_CONFIG>;

export const DEBUG_CLUSTER_CONFIG = z.object({
  name: z.literal(CLUSTER_TYPE.Debug),
});
export type DebugClusterConfig = z.infer<typeof DEBUG_CLUSTER_CONFIG>;

export const EXTERNAL_CLUSTER_CONFIG = z
  .object({
    name: z.literal(CLUSTER_TYPE.External),
  })
  .and(FILESYSTEM_CLUSTER_CONFIG);
export type ExternalClusterConfig = z.infer<typeof EXTERNAL_CLUSTER_CONFIG>;

export const NODE_CLUSTER_CONFIG = z
  .object({
    name: z.literal(CLUSTER_TYPE.Node),
    scriptPath: z.string(),
    hashcatPath: z.string(),
    instanceInterval: z.number().int().min(0),
    instanceCooldown: z.number().int(),
  })
  .and(FILESYSTEM_CLUSTER_CONFIG);
export type NodeClusterConfig = z.infer<typeof NODE_CLUSTER_CONFIG>;

const CLUSTER_TYPE_CONFIG = AWS_CLUSTER_CONFIG.or(DEBUG_CLUSTER_CONFIG)
  .or(EXTERNAL_CLUSTER_CONFIG)
  .or(NODE_CLUSTER_CONFIG);
export type ClusterTypeConfig = z.infer<typeof CLUSTER_TYPE_CONFIG>;

export const CLUSTER_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number().int().min(0),
  }),
  type: CLUSTER_TYPE_CONFIG,
});
export type ClusterConfig = z.infer<typeof CLUSTER_CONFIG>;

function loadFileSystemConfig(): FileSystemClusterConfig {
  return {
    instanceRoot:
      process.env[CLUSTER_ENV.instanceRoot] ?? DEFAULT_INSTANCE_ROOT,
    wordlistRoot:
      process.env[CLUSTER_ENV.wordlistRoot] ?? DEFAULT_WORDLIST_ROOT,
  };
}

function loadClusterTypeConfig(name: ClusterType) {
  switch (name) {
    case CLUSTER_TYPE.AWS:
      return {
        name,
        stepFunctionArn: process.env[CLUSTER_ENV.stepFunctionArn] ?? "",
        ...loadFileSystemConfig(),
      } satisfies AWSClusterConfig;
    case CLUSTER_TYPE.Debug:
      return {
        name,
      } satisfies DebugClusterConfig;
    case CLUSTER_TYPE.External:
      return {
        name,
        ...loadFileSystemConfig(),
      } satisfies ExternalClusterConfig;
    case CLUSTER_TYPE.Node:
      return {
        name,
        scriptPath:
          process.env[CLUSTER_ENV.scriptPath] ??
          path.join("..", "instance", "dist", "index.js"),
        hashcatPath: process.env[CLUSTER_ENV.hashcatPath] ?? "hashcat",
        instanceInterval: parseInt(
          process.env[CLUSTER_ENV.instanceInterval] ?? "1"
        ),
        instanceCooldown: parseInt(
          process.env[CLUSTER_ENV.instanceCooldown] ?? "-1"
        ),
        ...loadFileSystemConfig(),
      } satisfies NodeClusterConfig;
  }
}

export function loadClusterConfig() {
  const argClusterType = (process.env[CLUSTER_ENV.clusterType] ??
    CLUSTER_TYPE.Debug) as ClusterType;

  let clusterType: ClusterType;
  if (!CLUSTER_TYPES.includes(argClusterType)) clusterType = CLUSTER_TYPE.Debug;
  else clusterType = argClusterType;

  return CLUSTER_CONFIG.parse({
    host: {
      name: process.env[CLUSTER_ENV.clusterHost] ?? DEFAULT_HOST,
      port: parseInt(
        process.env[CLUSTER_ENV.clusterPort] ?? CLUSTER_DEFAULT_PORT.toString()
      ),
    },
    type: loadClusterTypeConfig(clusterType),
  } satisfies ClusterConfig);
}

export function argsClusterConfig(
  config: ClusterConfig
): Record<string, string> {
  return {
    CLUSTER_PORT: config.host.port.toString(),
  };
}

function envFileSystemClusterConfig(config: FileSystemClusterConfig) {
  return {
    [CLUSTER_ENV.instanceRoot]: config.instanceRoot,
    [CLUSTER_ENV.wordlistRoot]: config.wordlistRoot,
  };
}

function envClusterTypeConfig(config: ClusterTypeConfig) {
  switch (config.name) {
    case CLUSTER_TYPE.AWS:
      return {
        [CLUSTER_ENV.stepFunctionArn]: config.stepFunctionArn,
        ...envFileSystemClusterConfig(config),
      };

    case CLUSTER_TYPE.Debug:
      return {} as Record<string, string>;

    case CLUSTER_TYPE.External:
      return {
        ...envFileSystemClusterConfig(config),
      };

    case CLUSTER_TYPE.Node:
      return {
        [CLUSTER_ENV.scriptPath]: config.scriptPath,
        [CLUSTER_ENV.hashcatPath]: config.hashcatPath,
        [CLUSTER_ENV.instanceInterval]: config.instanceInterval.toString(),
        [CLUSTER_ENV.instanceCooldown]: config.instanceCooldown.toString(),
        ...envFileSystemClusterConfig(config),
      };
  }
}

export function envClusterConfig(
  config: ClusterConfig
): Record<string, string> {
  return {
    [CLUSTER_ENV.clusterHost]: config.host.name,
    [CLUSTER_ENV.clusterPort]: config.host.port.toString(),
    [CLUSTER_ENV.clusterType]: config.type.name,
    ...envClusterTypeConfig(config.type),
  };
}
