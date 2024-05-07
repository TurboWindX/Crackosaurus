import { z } from "zod";

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

export function loadBackendConfig() {
  return BACKEND_CONFIG.parse({
    host: {
      name: process.env["BACKEND_HOST"] ?? DEFAULT_HOST,
      port: process.env["BACKEND_PORT"]
        ? parseInt(process.env["BACKEND_PORT"])
        : BACKEND_DEFAULT_PORT,
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
