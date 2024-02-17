export const HASH_TYPES = ["NTLM", "bcrypt"] as const;
export type HashType = (typeof HASH_TYPES)[number];

export function getHashcatMode(type: HashType): number {
  switch (type) {
    case "NTLM":
      return 1000;
    case "bcrypt":
      return 3200;
    default:
      return -1;
  }
}

export function toHashcatHash(type: HashType, value: string): string {
  switch (type) {
    case "NTLM":
      return value.toLowerCase();
    default:
      return value;
  }
}

export function parseHashcatPot(data: string): Record<string, string> {
  return Object.fromEntries(
    data
      .split("\n")
      .filter((row) => row.trim().length > 0)
      .map((row) => row.split(":"))
  );
}
