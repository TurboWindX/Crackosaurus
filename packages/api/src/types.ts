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

export interface ClusterStatus {
  instances: Record<
    string,
    {
      status: Status;
      jobs: Record<
        string,
        {
          status: Status;
          hashes: Record<string, string>;
        }
      >;
    }
  >;
}
