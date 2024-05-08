import { z } from "zod";

import { BACKEND_DEFAULT_PORT, DEFAULT_HOST, WEB_DEFAULT_PORT } from "./host";

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

export function loadWebConfig() {
  return WEB_CONFIG.parse({
    host: {
      name: process.env["WEB_HOST"] ?? DEFAULT_HOST,
      port: process.env["WEB_PORT"]
        ? parseInt(process.env["WEB_PORT"])
        : WEB_DEFAULT_PORT,
    },
    backend: {
      name: process.env["BACKEND_HOST"] ?? DEFAULT_HOST,
      port: process.env["BACKEND_PORT"]
        ? parseInt(process.env["BACKEND_PORT"])
        : BACKEND_DEFAULT_PORT,
    },
  });
}
