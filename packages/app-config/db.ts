import { z } from "zod";

export const DATABASE_PROVIDERS = ["sqlite", "postgresql"] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const DATABASE_CONFIG = z.object({
  provider: z.enum(DATABASE_PROVIDERS),
  path: z.string(),
});
export type DatabaseConfig = z.infer<typeof DATABASE_CONFIG>;

export function loadDatabaseConfig() {
  if (!process.env["DATABASE_PATH"])
    process.env["DATABASE_PATH"] = "file:./db.sqlite";

  return DATABASE_CONFIG.parse({
    provider: process.env["DATABASE_PROVIDER"] ?? "sqlite",
    path: process.env["DATABASE_PATH"],
  });
}
