import { z } from "zod";

export const STATUSES = [
  "PENDING",
  "RUNNING",
  "STOPPED",
  "COMPLETE",
  "ERROR",
  "UNKNOWN",
  "FOUND",
  "NOT_FOUND",
] as const;

export const STATUS = {
  Pending: STATUSES[0],
  Running: STATUSES[1],
  Stopped: STATUSES[2],
  Complete: STATUSES[3],
  Error: STATUSES[4],
  Unknown: STATUSES[5],
  Found: STATUSES[6],
  NotFound: STATUSES[7],
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export const CLUSTER_STATUS = z.object({
  instances: z.record(
    z.string(),
    z.object({
      status: z.enum(STATUSES),
      jobs: z.record(
        z.string(),
        z.object({
          status: z.enum(STATUSES),
          hashes: z.record(z.string(), z.string()),
        })
      ),
    })
  ),
});

export type ClusterStatus = z.infer<typeof CLUSTER_STATUS>;
