export const HASH_TYPES = ["NTLM", "bcrypt"] as const;
export type HashType = (typeof HASH_TYPES)[number];

export const HASH_TYPE = {
  ntlm: HASH_TYPES[0],
  bcrypt: HASH_TYPES[1],
} as const;

export function getHashcatMode(type: HashType): number {
  switch (type) {
    case HASH_TYPE.ntlm:
      return 1000;
    case HASH_TYPE.bcrypt:
      return 3200;
  }
}

export function toHashcatHash(type: HashType, value: string): string {
  switch (type) {
    case HASH_TYPE.ntlm:
      return value.toLowerCase();
    case HASH_TYPE.bcrypt:
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
