import { z } from "zod";

import { CLUSTER_DEFAULT_PORT, DEFAULT_HOST } from "./host";

export const CLUSTER_TYPES = ["debug"] as const;
export type ClusterType = (typeof CLUSTER_TYPES)[number];

export const AWS_CLUSTER_CONFIG = z.object({
  name: z.literal("aws"),
  imageId: z.string(),
  roleName: z.string().optional(),
});
export type AWSClusterConfig = z.infer<typeof AWS_CLUSTER_CONFIG>;

export const FILESYSTEM_CLUSTER_CONFIG = z.object({
  name: z.literal("filesystem"),
  exePath: z.string(),
  rootFolder: z.string(),
  wordlistPath: z.string(),
});
export type FileSystemClusterConfig = z.infer<typeof FILESYSTEM_CLUSTER_CONFIG>;

export const DEBUG_CLUSTER_CONFIG = z.object({
  name: z.literal("debug"),
});
export type DebugClusterConfig = z.infer<typeof DEBUG_CLUSTER_CONFIG>;

export const CLUSTER_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number(),
  }),
  type: AWS_CLUSTER_CONFIG.or(DEBUG_CLUSTER_CONFIG).or(
    FILESYSTEM_CLUSTER_CONFIG
  ),
});
export type ClusterConfig = z.infer<typeof CLUSTER_CONFIG>;

export function loadClusterConfig() {
  const clusterType = process.env["CLUSTER_TYPE"] ?? "debug";

  let configType;
  if (clusterType === "debug") {
    configType = { name: "debug" };
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
  return {
    CLUSTER_HOST: config.host.name,
    CLUSTER_TYPE: config.type.name,
  };
}
