export const HASH_TYPES = [
  "bcrypt",
  "hmac-md5",
  "hmac-sha1",
  "hmac-sha256",
  "md5",
  "ntlm",
  "sha1",
  "sha256",
] as const;
export type HashType = (typeof HASH_TYPES)[number];

export const HASH_TYPE = {
  bcrypt: HASH_TYPES[0],
  hmac_md5: HASH_TYPES[1],
  hmac_sha1: HASH_TYPES[2],
  hmac_sha256: HASH_TYPES[3],
  md5: HASH_TYPES[4],
  ntlm: HASH_TYPES[5],
  sha1: HASH_TYPES[6],
  sha256: HASH_TYPES[7],
} as const;

export const HASH_TYPE_MODE = {
  [HASH_TYPE.md5]: 0,
  [HASH_TYPE.hmac_md5]: 50,
  [HASH_TYPE.sha1]: 100,
  [HASH_TYPE.hmac_sha1]: 150,
  [HASH_TYPE.ntlm]: 1000,
  [HASH_TYPE.sha256]: 1400,
  [HASH_TYPE.hmac_sha256]: 1450,
  [HASH_TYPE.bcrypt]: 3200,
} as const;

export function getHashcatMode(type: HashType): number {
  return HASH_TYPE_MODE[type];
}

export function toHashcatHash(type: HashType, value: string): string {
  switch (type) {
    case HASH_TYPE.md5:
    case HASH_TYPE.ntlm:
    case HASH_TYPE.sha1:
    case HASH_TYPE.sha256:
    case HASH_TYPE.hmac_md5:
    case HASH_TYPE.hmac_sha1:
    case HASH_TYPE.hmac_sha256:
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
