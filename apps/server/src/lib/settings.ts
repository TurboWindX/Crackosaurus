import type { PrismaClient } from "@prisma/client";

// Cluster-wide runtime settings, persisted in the AppSetting key/value table and
// edited by a root admin from the web settings page. Values are stored as
// strings and parsed per key here, so the rest of the codebase only ever sees
// typed, validated accessors — never a raw key/value read.

export const SETTING_KEYS = {
  /** Max wall-clock lifetime (hours) before an idle instance is reaped. */
  maxInstanceLifeHours: "maxInstanceLifeHours",
} as const;

// Hard ceiling for the max-instance-life setting (1 year). Bounds both the API
// input and any hand-edited DB value so a typo can't push the reaper cutoff
// absurdly far into the future (effectively disabling it silently).
export const MAX_INSTANCE_LIFE_HOURS_CEILING = 8760;

/**
 * Current max-instance-life, in hours. 0 means the feature is DISABLED — no box
 * is ever reaped for age. This is the default when the setting was never saved,
 * so shipping the feature does not start terminating anything until an admin
 * explicitly opts in with a positive value. A non-numeric or out-of-range stored
 * value also reads as disabled (fail-safe: never terminate on garbage input).
 */
export async function getMaxInstanceLifeHours(
  prisma: PrismaClient
): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEYS.maxInstanceLifeHours },
  });
  if (row === null) return 0;

  const n = Number.parseInt(row.value, 10);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_INSTANCE_LIFE_HOURS_CEILING)
    return 0;
  return n;
}

/**
 * Persist the max-instance-life setting (hours). Callers must have already
 * clamped/validated `hours` to [0, MAX_INSTANCE_LIFE_HOURS_CEILING]; 0 disables.
 */
export async function setMaxInstanceLifeHours(
  prisma: PrismaClient,
  hours: number
): Promise<void> {
  const value = String(hours);
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEYS.maxInstanceLifeHours },
    update: { value },
    create: { key: SETTING_KEYS.maxInstanceLifeHours, value },
  });
}
