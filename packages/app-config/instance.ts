import { z } from "zod";

import { DEFAULT_INSTANCE_ROOT, DEFAULT_WORDLIST_ROOT } from "./path";

const INSTANCE_ENV = {
  instanceID: "INSTANCE_ID",
  hashcatPath: "HASHCAT_PATH",
  instanceRoot: "INSTANCE_ROOT",
  wordlistRoot: "WORDLIST_ROOT",
  instanceInterval: "INSTANCE_INTERVAL",
  instanceCooldown: "INSTANCE_COOLDOWN",
} as const;

export const INSTANCE_CONFIG = z.object({
  instanceID: z.string(),
  hashcatPath: z.string(),
  instanceRoot: z.string(),
  wordlistRoot: z.string(),
  instanceInterval: z.number().int().min(0),
  instanceCooldown: z.number().int(),
});
export type InstanceConfig = z.infer<typeof INSTANCE_CONFIG>;

export function loadInstanceConfig() {
  return INSTANCE_CONFIG.parse({
    instanceID: process.env[INSTANCE_ENV.instanceID] ?? "instance",
    hashcatPath: process.env[INSTANCE_ENV.hashcatPath] ?? "hashcat",
    instanceRoot:
      process.env[INSTANCE_ENV.instanceRoot] ?? DEFAULT_INSTANCE_ROOT,
    wordlistRoot:
      process.env[INSTANCE_ENV.wordlistRoot] ?? DEFAULT_WORDLIST_ROOT,
    instanceInterval: parseInt(
      process.env[INSTANCE_ENV.instanceInterval] ?? "1"
    ),
    instanceCooldown: parseInt(
      process.env[INSTANCE_ENV.instanceCooldown] ?? "-1"
    ),
  } satisfies InstanceConfig);
}

export function envInstanceConfig(
  config: InstanceConfig
): Record<string, string> {
  return {
    [INSTANCE_ENV.instanceID]: config.instanceID,
    [INSTANCE_ENV.hashcatPath]: config.hashcatPath,
    [INSTANCE_ENV.instanceRoot]: config.instanceRoot,
    [INSTANCE_ENV.wordlistRoot]: config.wordlistRoot,
    [INSTANCE_ENV.instanceInterval]: config.instanceInterval.toString(),
    [INSTANCE_ENV.instanceCooldown]: config.instanceCooldown.toString(),
  };
}
