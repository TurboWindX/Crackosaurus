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

const STATUS_STRING = {
  [STATUS.Pending]: "Pending",
  [STATUS.Running]: "Running",
  [STATUS.Stopped]: "Stopped",
  [STATUS.Complete]: "Complete",
  [STATUS.Error]: "Error",
  [STATUS.Unknown]: "Unknown",
  [STATUS.Found]: "Found",
  [STATUS.NotFound]: "Not Found",
} as const;

export function getStatusString(status: Status): string {
  return STATUS_STRING[status];
}

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
