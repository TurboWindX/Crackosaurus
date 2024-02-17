export const STATUSES = [
  "PENDING",
  "RUNNING",
  "STOPPED",
  "COMPLETE",
  "ERROR",
  "UNKNOWN",
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIVE_STATUSES: { [key in Status]?: boolean } = {
  PENDING: true,
  RUNNING: true,
  UNKNOWN: true,
} as const;

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
