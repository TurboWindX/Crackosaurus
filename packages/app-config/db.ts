import { z } from "zod";

const DATABASE_ENV = {
  databaseProvider: "DATABASE_PROVIDER",
  databasePath: "DATABASE_PATH",
} as const;

export const DATABASE_PROVIDERS = ["sqlite", "postgresql"] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const DATABASE_PROVIDER = {
  SQLite: DATABASE_PROVIDERS[0],
  Postgres: DATABASE_PROVIDERS[1],
} as const;

export const DATABASE_CONFIG = z.object({
  provider: z.enum(DATABASE_PROVIDERS),
  path: z.string(),
});
export type DatabaseConfig = z.infer<typeof DATABASE_CONFIG>;

export function loadDatabaseConfig() {
  if (!process.env[DATABASE_ENV.databasePath])
    process.env[DATABASE_ENV.databasePath] = "file:./db.sqlite";

  return DATABASE_CONFIG.parse({
    provider: (process.env[DATABASE_ENV.databaseProvider] ??
      DATABASE_PROVIDER.SQLite) as DatabaseProvider,
    path: process.env[DATABASE_ENV.databasePath] as string,
  } satisfies DatabaseConfig);
}
