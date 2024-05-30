import { z } from "zod";

import { DEFAULT_INSTANCE_ROOT, DEFAULT_WORDLIST_ROOT } from "./path";

export const INSTANCE_CONFIG = z.object({
  instanceID: z.string(),
  hashcatPath: z.string(),
  instanceRoot: z.string(),
  wordlistRoot: z.string(),
});
export type InstanceConfig = z.infer<typeof INSTANCE_CONFIG>;

export function loadInstanceConfig() {
  return INSTANCE_CONFIG.parse({
    instanceID: process.env["INSTANCE_ID"] ?? "0",
    hashcatPath: process.env["HASHCAT_PATH"] ?? "hashcat",
    instanceRoot: process.env["INSTANCE_ROOT"] ?? DEFAULT_INSTANCE_ROOT,
    wordlistRoot: process.env["WORDLIST_ROOT"] ?? DEFAULT_WORDLIST_ROOT,
  });
}

export function envInstanceConfig(
  config: InstanceConfig
): Record<string, string> {
  return {
    INSTANCE_ID: config.instanceID,
    HASHCAT_PATH: config.hashcatPath,
    INSTANCE_ROOT: config.instanceRoot,
    WORDLIST_ROOT: config.wordlistRoot,
  };
}
