import { z } from "zod";

const DATABASE_ENV = {
  databaseProvider: "DATABASE_PROVIDER",
  databasePath: "DATABASE_PATH",
} as const;

export const DATABASE_PROVIDERS = ["postgresql"] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const DATABASE_PROVIDER = {
  Postgres: DATABASE_PROVIDERS[0],
} as const;

export const DATABASE_CONFIG = z.object({
  provider: z.enum(DATABASE_PROVIDERS),
  path: z.string(),
});
export type DatabaseConfig = z.infer<typeof DATABASE_CONFIG>;

export function loadDatabaseConfig() {
  if (!process.env[DATABASE_ENV.databasePath])
    process.env[DATABASE_ENV.databasePath] = "postgresql://postgres:postgres@localhost:5432/crackosaurus?schema=public";

  return DATABASE_CONFIG.parse({
    provider: (process.env[DATABASE_ENV.databaseProvider] ??
      DATABASE_PROVIDER.Postgres) as DatabaseProvider,
    path: process.env[DATABASE_ENV.databasePath] as string,
  } satisfies DatabaseConfig);
}
