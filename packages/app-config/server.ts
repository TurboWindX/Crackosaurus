import { z } from "zod";

import { DATABASE_PROVIDERS } from "./db";
import {
  BACKEND_DEFAULT_PORT,
  CLUSTER_DEFAULT_PORT,
  DEFAULT_HOST,
  WEB_DEFAULT_PORT,
} from "./host";

export const BACKEND_DEFAULT_SECRET = "$SECRET:123456789012345678901234567890$";

export const BACKEND_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number(),
  }),
  database: z.object({
    provider: z.enum(DATABASE_PROVIDERS),
    path: z.string(),
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

export function loadBackendConfig(): BackendConfig {
  if (!process.env["DATABASE_PATH"])
    process.env["DATABASE_PATH"] = "file:./db.sqlite";

  return BACKEND_CONFIG.parse({
    host: {
      name: process.env["BACKEND_HOST"] ?? DEFAULT_HOST,
      port: process.env["BACKEND_PORT"]
        ? parseInt(process.env["BACKEND_PORT"])
        : BACKEND_DEFAULT_PORT,
    },
    database: {
      provider: process.env["DATABASE_PROVIDER"] ?? "sqlite",
      path: process.env["DATABASE_PATH"],
    },
    web: {
      name: process.env["WEB_HOST"] ?? DEFAULT_HOST,
      port: process.env["WEB_PORT"]
        ? parseInt(process.env["WEB_PORT"])
        : WEB_DEFAULT_PORT,
    },
    cluster: {
      name: process.env["CLUSTER_HOST"] ?? DEFAULT_HOST,
      port: process.env["CLUSTER_PORT"]
        ? parseInt(process.env["CLUSTER_PORT"])
        : CLUSTER_DEFAULT_PORT,
    },
    secret: process.env["BACKEND_SECRET"] ?? BACKEND_DEFAULT_SECRET,
  });
}

export function argsBackendConfig(
  config: BackendConfig
): Record<string, string> {
  return {
    WEB_HOST: config.web.name,
    WEB_PORT: config.web.port.toString(),
    DATABASE_PROVIDER: config.database.provider,
  };
}

export function envBackendConfig(
  config: BackendConfig
): Record<string, string> {
  return {
    BACKEND_HOST: config.host.name,
    BACKEND_PORT: config.host.port.toString(),
    BACKEND_SECRET: config.secret,
    DATABASE_PATH: config.database.path,
    CLUSTER_HOST: config.cluster.name,
    CLUSTER_PORT: config.cluster.port.toString(),
  };
}
