export const HASH_TYPES = ["NTLM", "bcrypt"] as const;
export type HashType = (typeof HASH_TYPES)[number];

export const STATUSES = [
  "PENDING",
  "STARTED",
  "STOPPED",
  "COMPLETE",
  "ERROR",
  "UNKNOWN",
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIVE_STATUSES: { [key in Status]?: boolean } = {
  PENDING: true,
  STARTED: true,
  UNKNOWN: true,
} as const;

export interface ClusterStatus {
  instances: {
    [key: string]: {
      status: string;
      jobs: {
        [key: string]: {
          status: string;
          hashes: {
            [key: string]: {
              status: string;
              value?: string;
            };
          };
        };
      };
    };
  };
}
