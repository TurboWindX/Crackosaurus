import { z } from "zod";

import { DATABASE_PROVIDERS, DatabaseProvider } from "./db";
import {
  BACKEND_DEFAULT_PORT,
  CLUSTER_DEFAULT_PORT,
  DEFAULT_HOST,
  WEB_DEFAULT_PORT,
} from "./host";

export const BACKEND_ENV = {
  backendHost: "BACKEND_HOST",
  backendPort: "BACKEND_PORT",
  backendSecret: "BACKEND_SECRET",
  databaseProvider: "DATABASE_PROVIDER",
  databasePath: "DATABASE_PATH",
  webHost: "WEB_HOST",
  webPort: "WEB_PORT",
  clusterHost: "CLUSTER_HOST",
  clusterPort: "CLUSTER_PORT",
  s3BucketArn: "S3_BUCKET_ARN",
  s3RoleArn: "S3_ROLE_ARN",
} as const;

export const BACKEND_DEFAULT_SECRET = "$SECRET:123456789012345678901234567890$";

export const BACKEND_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number().int().min(0),
  }),
  database: z.object({
    provider: z.enum(DATABASE_PROVIDERS),
    path: z.string(),
  }),
  web: z.object({
    name: z.string(),
    port: z.number().int().min(0),
  }),
  cluster: z.object({
    name: z.string(),
    port: z.number().int().min(0),
  }),
  secret: z.string().min(32),
  s3: z.object({
    bucketArn: z.string(),
    roleArn: z.string(),
  }),
});
export type BackendConfig = z.infer<typeof BACKEND_CONFIG>;

export function loadBackendConfig(): BackendConfig {
  if (!process.env[BACKEND_ENV.databasePath]) {
    // Set appropriate default based on provider
    const provider = process.env[BACKEND_ENV.databaseProvider] ?? "sqlite";
    if (provider === "postgresql") {
      process.env[BACKEND_ENV.databasePath] =
        "postgresql://user:password@localhost:5432/crackosaurus";
    } else {
      process.env[BACKEND_ENV.databasePath] = "file:./db.sqlite";
    }
  }

  return BACKEND_CONFIG.parse({
    host: {
      name: process.env[BACKEND_ENV.backendHost] ?? DEFAULT_HOST,
      port: parseInt(
        process.env[BACKEND_ENV.backendPort] ?? BACKEND_DEFAULT_PORT.toString()
      ),
    },
    database: {
      provider: (process.env[BACKEND_ENV.databaseProvider] ??
        "sqlite") as DatabaseProvider,
      path: process.env[BACKEND_ENV.databasePath] as string,
    },
    web: {
      name: process.env[BACKEND_ENV.webHost] ?? DEFAULT_HOST,
      port: parseInt(
        process.env[BACKEND_ENV.webPort] ?? WEB_DEFAULT_PORT.toString()
      ),
    },
    cluster: {
      name: process.env[BACKEND_ENV.clusterHost] ?? DEFAULT_HOST,
      port: parseInt(
        process.env[BACKEND_ENV.clusterPort] ?? CLUSTER_DEFAULT_PORT.toString()
      ),
    },
    secret: process.env[BACKEND_ENV.backendSecret] ?? BACKEND_DEFAULT_SECRET,
    s3: {
      bucketArn: process.env[BACKEND_ENV.s3BucketArn] ?? "",
      roleArn: process.env[BACKEND_ENV.s3RoleArn] ?? "",
    },
  } satisfies BackendConfig);
}

export function argsBackendConfig(
  config: BackendConfig
): Record<string, string> {
  return {
    [BACKEND_ENV.backendHost]: config.host.name,
    [BACKEND_ENV.backendPort]: config.host.port.toString(),
    [BACKEND_ENV.databaseProvider]: config.database.provider,
    [BACKEND_ENV.s3BucketArn]: config.s3.bucketArn,
    [BACKEND_ENV.s3RoleArn]: config.s3.roleArn,
  };
}

export function envBackendConfig(
  config: BackendConfig
): Record<string, string> {
  return {
    [BACKEND_ENV.backendHost]: config.host.name,
    [BACKEND_ENV.backendPort]: config.host.port.toString(),
    [BACKEND_ENV.backendSecret]: config.secret,
    [BACKEND_ENV.databasePath]: config.database.path,
    [BACKEND_ENV.clusterHost]: config.cluster.name,
    [BACKEND_ENV.clusterPort]: config.cluster.port.toString(),
    [BACKEND_ENV.s3BucketArn]: config.s3.bucketArn,
    [BACKEND_ENV.s3RoleArn]: config.s3.roleArn,
  };
}
