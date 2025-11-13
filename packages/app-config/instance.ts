import { z } from "zod";

import { DEFAULT_INSTANCE_ROOT, DEFAULT_WORDLIST_ROOT } from "./path";

const INSTANCE_ENV = {
  instanceID: "INSTANCE_ID",
  instanceType: "INSTANCE_TYPE",
  hashcatPath: "HASHCAT_PATH",
  instanceRoot: "INSTANCE_ROOT",
  wordlistRoot: "WORDLIST_ROOT",
  ruleRoot: "RULE_ROOT",
  instanceInterval: "INSTANCE_INTERVAL",
  instanceCooldown: "INSTANCE_COOLDOWN",
  jobQueueUrl: "JOB_QUEUE_URL",
} as const;

export const INSTANCE_CONFIG = z.object({
  instanceID: z.string(),
  instanceType: z.string(),
  hashcatPath: z.string(),
  instanceRoot: z.string(),
  wordlistRoot: z.string(),
  ruleRoot: z.string().optional(),
  instanceInterval: z.number().int().min(0),
  instanceCooldown: z.number().int(),
});
export type InstanceConfig = z.infer<typeof INSTANCE_CONFIG>;

export function loadInstanceConfig() {
  return INSTANCE_CONFIG.parse({
    instanceID: process.env[INSTANCE_ENV.instanceID] ?? "instance",
    instanceType: process.env[INSTANCE_ENV.instanceType] ?? "external",
    hashcatPath: process.env[INSTANCE_ENV.hashcatPath] ?? "hashcat",
    instanceRoot:
      process.env[INSTANCE_ENV.instanceRoot] ?? DEFAULT_INSTANCE_ROOT,
    wordlistRoot:
      process.env[INSTANCE_ENV.wordlistRoot] ?? DEFAULT_WORDLIST_ROOT,
    ruleRoot: process.env[INSTANCE_ENV.ruleRoot],
    instanceInterval: parseInt(
      process.env[INSTANCE_ENV.instanceInterval] ?? "1"
    ),
    instanceCooldown: parseInt(
      process.env[INSTANCE_ENV.instanceCooldown] ?? "-1"
    ),
    // jobQueueUrl: process.env[INSTANCE_ENV.jobQueueUrl], // removed
  } satisfies InstanceConfig);
}

export function envInstanceConfig(
  config: InstanceConfig
): Record<string, string> {
  const env: Record<string, string> = {
    [INSTANCE_ENV.instanceID]: config.instanceID,
    [INSTANCE_ENV.instanceType]: config.instanceType,
    [INSTANCE_ENV.hashcatPath]: config.hashcatPath,
    [INSTANCE_ENV.instanceRoot]: config.instanceRoot,
    [INSTANCE_ENV.wordlistRoot]: config.wordlistRoot,
    [INSTANCE_ENV.instanceInterval]: config.instanceInterval.toString(),
    [INSTANCE_ENV.instanceCooldown]: config.instanceCooldown.toString(),
  };

  // jobQueueUrl removed from instance env

  if (config.ruleRoot) {
    env[INSTANCE_ENV.ruleRoot] = config.ruleRoot;
  }

  return env;
}
