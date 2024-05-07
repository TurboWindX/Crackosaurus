import { z } from "zod";

export const DATABASE_PROVIDERS = ["sqlite", "postgresql"] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const DATABASE_CONFIG = z.object({
  provider: z.enum(DATABASE_PROVIDERS),
  path: z.string(),
});
export type DatabaseConfig = z.infer<typeof DATABASE_CONFIG>;

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

export const CLUSTER_DEFAULT_PORT = 8001;
export const CLUSTER_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number().default(CLUSTER_DEFAULT_PORT),
  }),
  type: AWS_CLUSTER_CONFIG.or(DEBUG_CLUSTER_CONFIG).or(
    FILESYSTEM_CLUSTER_CONFIG
  ),
});
export type ClusterConfig = z.infer<typeof CLUSTER_CONFIG>;

export const BACKEND_DEFAULT_PORT = 8000;
export const BACKEND_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number().default(BACKEND_DEFAULT_PORT),
  }),
  web: z.object({
    name: z.string(),
    port: z.number(),
  }),
  cluster: z.object({
    name: z.string(),
    port: z.number(),
  }),
  secret: z.string().min(32),
});
export type BackendConfig = z.infer<typeof BACKEND_CONFIG>;

export const WEB_DEFAULT_PORT = 5174;
export const WEB_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number().default(WEB_DEFAULT_PORT),
  }),
  backend: z.object({
    name: z.string(),
    port: z.number(),
  }),
});
export type WebConfig = z.infer<typeof WEB_CONFIG>;

export const PROFILE_CONFIG = z.object({
  name: z.string(),
  database: DATABASE_CONFIG,
  cluster: CLUSTER_CONFIG,
  backend: BACKEND_CONFIG,
  web: WEB_CONFIG,
});
export type ProfileConfig = z.infer<typeof PROFILE_CONFIG>;

export const APP_CONFIG = z.object({
  profiles: z.array(PROFILE_CONFIG),
});
export type AppConfig = z.infer<typeof APP_CONFIG>;
