import { z } from "zod";

import { BACKEND_DEFAULT_PORT, DEFAULT_HOST, WEB_DEFAULT_PORT } from "./host";

const WEB_ENV = {
  backendHost: "BACKEND_HOST",
  backendPort: "BACKEND_PORT",
  webHost: "WEB_HOST",
  webPort: "WEB_PORT",
} as const;

export const WEB_CONFIG = z.object({
  host: z.object({
    name: z.string(),
    port: z.number().int().min(0),
  }),
  backend: z.object({
    name: z.string(),
    port: z.number().int().min(0),
  }),
});
export type WebConfig = z.infer<typeof WEB_CONFIG>;

export function loadWebConfig() {
  return WEB_CONFIG.parse({
    host: {
      name: process.env[WEB_ENV.webHost] ?? DEFAULT_HOST,
      port: parseInt(
        process.env[WEB_ENV.webPort] ?? WEB_DEFAULT_PORT.toString()
      ),
    },
    backend: {
      name: process.env[WEB_ENV.backendHost] ?? DEFAULT_HOST,
      port: parseInt(
        process.env[WEB_ENV.backendPort] ?? BACKEND_DEFAULT_PORT.toString()
      ),
    },
  } satisfies WebConfig);
}
