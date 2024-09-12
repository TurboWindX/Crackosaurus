export const HASH_TYPES = {
  md5: 0,
  hmac_md5: 50,
  sha1: 100,
  hmac_sha1: 150,
  ntlm: 1000,
  sha256: 1400,
  hmac_sha256: 1450,
  bcrypt: 3200,
  plaintext: 99999,
} as const;

export const HASH_TYPE_NAME = Object.fromEntries(
  Object.entries(HASH_TYPES).map(([key, value]) => [value, key])
);

export function getHashName(type: number): string {
  const name = HASH_TYPE_NAME[type];
  if (name) return name;
  return type.toString();
}

export function toHashcatHash(mode: number, value: string): string {
  switch (mode) {
    case HASH_TYPES.md5:
    case HASH_TYPES.ntlm:
    case HASH_TYPES.sha1:
    case HASH_TYPES.sha256:
    case HASH_TYPES.hmac_md5:
    case HASH_TYPES.hmac_sha1:
    case HASH_TYPES.hmac_sha256:
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
