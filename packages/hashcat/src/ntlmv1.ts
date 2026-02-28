/**
 * NTLMv1 Multi-Tool — TypeScript implementation
 *
 * Converts NTLMv1 / NTLMv1+ESS challenge-response hashes into DES pairs
 * suitable for cracking with hashcat mode 14000, then reassembles cracked
 * DES keys back into the original NTLM hash.
 *
 * Based on https://github.com/evilmog/ntlmv1-multi (MIT)
 * and Hashcat forum work by atom: https://hashcat.net/forum/thread-5832.html
 */
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedNtlmv1 {
  /** Original full hash string */
  raw: string;
  user: string;
  domain: string;
  /** Server challenge (hex, 16 chars = 8 bytes) */
  challenge: string;
  /** LM response (hex, 48 chars = 24 bytes) */
  lmResponse: string;
  /** NT response (hex, 48 chars = 24 bytes) */
  ntResponse: string;
  /** Whether Extended Session Security is engaged */
  isEss: boolean;
  /** Effective server challenge (may differ from original for ESS) */
  effectiveChallenge: string;
  /** CT1: first 8-byte ciphertext block from NT response */
  ct1: string;
  /** CT2: second 8-byte ciphertext block from NT response */
  ct2: string;
  /** CT3: third 8-byte ciphertext block (last 2 NTLM bytes + 5 null bytes) */
  ct3: string;
}

export interface DesHashPair {
  /** DES ciphertext (hex, 16 chars) */
  ciphertext: string;
  /** Server challenge / DES plaintext (hex, 16 chars) */
  challenge: string;
  /** Combined format for hashcat mode 14000: "CT:challenge" */
  hashcatLine: string;
}

export interface Ntlmv1Conversion {
  parsed: ParsedNtlmv1;
  /** Two DES pairs for hashcat mode 14000 */
  desPairs: [DesHashPair, DesHashPair];
}

export interface Ntlmv1Result {
  /** The original NTLMv1 hash string */
  originalHash: string;
  /** Recovered 32-hex-char NTLM hash, or null if incomplete */
  ntlmHash: string | null;
  /** First 7 bytes of NTLM (from DES key 1), hex */
  part1: string | null;
  /** Next 7 bytes of NTLM (from DES key 2), hex */
  part2: string | null;
  /** Last 2 bytes of NTLM (from CT3 brute-force), hex */
  part3: string | null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse an NTLMv1 hash in Responder/hashcat format:
 *   user::domain:lm_response:nt_response:challenge
 */
export function parseNtlmv1(hash: string): ParsedNtlmv1 {
  const parts = hash.split(":");
  if (parts.length !== 6) {
    throw new Error(
      `Invalid NTLMv1 hash format: expected 6 colon-separated fields, got ${parts.length}`
    );
  }

  const user = parts[0]!;
  const domain = parts[2]!;
  const lmResponse = parts[3]!;
  const ntResponse = parts[4]!;
  const challenge = parts[5]!;

  if (ntResponse.length !== 48) {
    throw new Error(
      `Invalid NT response length: expected 48 hex chars, got ${ntResponse.length}`
    );
  }
  if (challenge.length !== 16) {
    throw new Error(
      `Invalid challenge length: expected 16 hex chars, got ${challenge.length}`
    );
  }

  const lmUpper = lmResponse.toUpperCase();
  const ntUpper = ntResponse.toUpperCase();
  const challUpper = challenge.toLowerCase();

  // ESS detection: LM response bytes [10..23] are all zeros
  // i.e. hex chars [20..47] are "0000000000000000000000000000"
  const isEss = lmUpper.substring(20, 48) === "0000000000000000000000000000";

  let effectiveChallenge: string;

  if (isEss) {
    // For ESS, the effective server challenge is:
    //   MD5(original_challenge + client_challenge)[0:8]
    // where client_challenge = first 8 bytes of LM response
    const clientChallenge = lmUpper.substring(0, 16);
    const combined = challUpper + clientChallenge.toLowerCase();
    const md5 = crypto.createHash("md5");
    md5.update(Buffer.from(combined, "hex"));
    effectiveChallenge = md5.digest("hex").substring(0, 16);
  } else {
    effectiveChallenge = challUpper;
  }

  const ct1 = ntUpper.substring(0, 16);
  const ct2 = ntUpper.substring(16, 32);
  const ct3 = ntUpper.substring(32, 48);

  return {
    raw: hash,
    user,
    domain,
    challenge: challUpper,
    lmResponse: lmUpper,
    ntResponse: ntUpper,
    isEss,
    effectiveChallenge,
    ct1,
    ct2,
    ct3,
  };
}

// ---------------------------------------------------------------------------
// NTLMv1 → DES conversion
// ---------------------------------------------------------------------------

/**
 * Convert a parsed NTLMv1 hash into two DES hash pairs for hashcat mode 14000.
 */
export function ntlmv1ToDes(parsed: ParsedNtlmv1): Ntlmv1Conversion {
  const ch = parsed.effectiveChallenge;
  const pair1: DesHashPair = {
    ciphertext: parsed.ct1,
    challenge: ch,
    hashcatLine: `${parsed.ct1}:${ch}`,
  };
  const pair2: DesHashPair = {
    ciphertext: parsed.ct2,
    challenge: ch,
    hashcatLine: `${parsed.ct2}:${ch}`,
  };
  return { parsed, desPairs: [pair1, pair2] };
}

/**
 * Convert a batch of NTLMv1 hashes to DES pairs.
 * Returns a mapping from DES hashcat line → original NTLMv1 info.
 */
export function batchNtlmv1ToDes(hashes: string[]): {
  desLines: string[];
  conversions: Ntlmv1Conversion[];
  /** Map from DES hashcat line → index into conversions + pair index (0 or 1) */
  desLineMap: Map<string, { conversionIndex: number; pairIndex: 0 | 1 }>;
} {
  const desLines: string[] = [];
  const conversions: Ntlmv1Conversion[] = [];
  const desLineMap = new Map<
    string,
    { conversionIndex: number; pairIndex: 0 | 1 }
  >();
  const seenDesLines = new Set<string>();

  for (const hash of hashes) {
    const parsed = parseNtlmv1(hash);
    const conversion = ntlmv1ToDes(parsed);
    const convIdx = conversions.length;
    conversions.push(conversion);

    for (let pi = 0; pi < 2; pi++) {
      const line = conversion.desPairs[pi as 0 | 1].hashcatLine;
      if (!seenDesLines.has(line)) {
        seenDesLines.add(line);
        desLines.push(line);
      }
      desLineMap.set(line, {
        conversionIndex: convIdx,
        pairIndex: pi as 0 | 1,
      });
    }
  }

  return { desLines, conversions, desLineMap };
}

// ---------------------------------------------------------------------------
// DES key expansion / contraction
// ---------------------------------------------------------------------------

/**
 * Expand a 7-byte key material into an 8-byte DES key with parity bits.
 *
 * Each output byte has 7 data bits (positions 7..1) and 1 parity bit (position 0)
 * set for odd parity.
 */
export function expandDesKey(fragment7: Buffer): Buffer {
  if (fragment7.length !== 7) {
    throw new Error(`Expected 7-byte fragment, got ${fragment7.length}`);
  }

  // Extract bytes (validated length above)
  const b0 = fragment7[0]!;
  const b1 = fragment7[1]!;
  const b2 = fragment7[2]!;
  const b3 = fragment7[3]!;
  const b4 = fragment7[4]!;
  const b5 = fragment7[5]!;
  const b6 = fragment7[6]!;

  const key = Buffer.alloc(8);
  key[0] = (b0 >> 1) & 0x7f;
  key[1] = ((b0 & 0x01) << 6) | ((b1 >> 2) & 0x3f);
  key[2] = ((b1 & 0x03) << 5) | ((b2 >> 3) & 0x1f);
  key[3] = ((b2 & 0x07) << 4) | ((b3 >> 4) & 0x0f);
  key[4] = ((b3 & 0x0f) << 3) | ((b4 >> 5) & 0x07);
  key[5] = ((b4 & 0x1f) << 2) | ((b5 >> 6) & 0x03);
  key[6] = ((b5 & 0x3f) << 1) | ((b6 >> 7) & 0x01);
  key[7] = b6 & 0x7f;

  // Add parity bits (odd parity for each byte)
  for (let i = 0; i < 8; i++) {
    let byte = (key[i]! << 1) & 0xfe;
    // Count bits
    let bits = 0;
    let v = byte;
    while (v) {
      bits += v & 1;
      v >>= 1;
    }
    if (bits % 2 === 0) byte |= 1; // Set parity for odd parity
    key[i] = byte;
  }

  return key;
}

/**
 * Contract an 8-byte DES key (with parity) back to 7 bytes of key material.
 * This reverses expandDesKey.
 */
export function contractDesKey(desKey8: Buffer): Buffer {
  if (desKey8.length !== 8) {
    throw new Error(`Expected 8-byte DES key, got ${desKey8.length}`);
  }

  // Strip parity bits: each byte's data is in bits 7..1
  const s0 = desKey8[0]! >> 1;
  const s1 = desKey8[1]! >> 1;
  const s2 = desKey8[2]! >> 1;
  const s3 = desKey8[3]! >> 1;
  const s4 = desKey8[4]! >> 1;
  const s5 = desKey8[5]! >> 1;
  const s6 = desKey8[6]! >> 1;
  const s7 = desKey8[7]! >> 1;

  const fragment = Buffer.alloc(7);
  fragment[0] = (s0 << 1) | (s1 >> 6);
  fragment[1] = ((s1 & 0x3f) << 2) | (s2 >> 5);
  fragment[2] = ((s2 & 0x1f) << 3) | (s3 >> 4);
  fragment[3] = ((s3 & 0x0f) << 4) | (s4 >> 3);
  fragment[4] = ((s4 & 0x07) << 5) | (s5 >> 2);
  fragment[5] = ((s5 & 0x03) << 6) | (s6 >> 1);
  fragment[6] = ((s6 & 0x01) << 7) | s7;

  return fragment;
}

/**
 * Convert a cracked DES key (hex string, 16 chars = 8 bytes) into a 7-byte
 * NTLM hash fragment (hex string, 14 chars).
 */
export function desKeyToNtlmFragment(desKeyHex: string): string {
  const desKey = Buffer.from(desKeyHex, "hex");
  return contractDesKey(desKey).toString("hex");
}

// ---------------------------------------------------------------------------
// CT3 brute-force (recover last 2 bytes of NTLM hash)
// ---------------------------------------------------------------------------

/**
 * DES-ECB encrypt 8 bytes of data with an 8-byte key using Node.js crypto.
 */
function desEncrypt(key8: Buffer, data8: Buffer): Buffer {
  const cipher = crypto.createCipheriv("des-ecb", key8, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data8), cipher.final()]);
}

/**
 * Brute-force the last 2 bytes of the NTLM hash from CT3.
 *
 * CT3 = DES_encrypt(challenge, expand(NTLM[14:16] + 0x00*5))
 *
 * We try all 65536 possible 2-byte values.  This takes milliseconds.
 *
 * @returns 4-char hex string (2 bytes), or null if no match found.
 */
export function recoverCt3(
  ct3Hex: string,
  challengeHex: string,
  lmResponseHex?: string
): string | null {
  let effectiveChallenge: Buffer;

  if (
    lmResponseHex &&
    lmResponseHex.substring(20, 48) === "0000000000000000000000000000"
  ) {
    // ESS: recompute effective challenge
    const clientChallenge = lmResponseHex.substring(0, 16);
    const combined = challengeHex + clientChallenge.toLowerCase();
    const md5 = crypto.createHash("md5");
    md5.update(Buffer.from(combined, "hex"));
    effectiveChallenge = md5.digest().subarray(0, 8);
  } else {
    effectiveChallenge = Buffer.from(challengeHex, "hex");
  }

  const ct3 = Buffer.from(ct3Hex, "hex");

  for (let i = 0; i < 0x10000; i++) {
    // Construct 7-byte key material: [low_byte, high_byte, 0, 0, 0, 0, 0]
    const fragment = Buffer.alloc(7);
    fragment[0] = i & 0xff;
    fragment[1] = (i >> 8) & 0xff;

    const desKey = expandDesKey(fragment);
    const encrypted = desEncrypt(desKey, effectiveChallenge);

    if (encrypted.equals(ct3)) {
      // Return as 4-char hex with low byte first (matching ntlmv1-multi output)
      return fragment.subarray(0, 2).toString("hex");
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// NTLM hash reassembly
// ---------------------------------------------------------------------------

/**
 * Reassemble a full 16-byte (32-hex-char) NTLM hash from cracked DES keys
 * and the CT3-derived last 2 bytes.
 *
 * @param desKey1Hex - Cracked DES key 1 (16 hex chars / 8 bytes)
 * @param desKey2Hex - Cracked DES key 2 (16 hex chars / 8 bytes)
 * @param ct3LastBytes - Last 2 bytes recovered from CT3 (4 hex chars)
 * @returns 32-char hex NTLM hash
 */
export function reassembleNtlm(
  desKey1Hex: string,
  desKey2Hex: string,
  ct3LastBytes: string
): string {
  const part1 = desKeyToNtlmFragment(desKey1Hex); // 14 hex chars (7 bytes)
  const part2 = desKeyToNtlmFragment(desKey2Hex); // 14 hex chars (7 bytes)
  const part3 = ct3LastBytes; // 4 hex chars (2 bytes)
  return (part1 + part2 + part3).toLowerCase();
}

/**
 * Process cracked DES results for a batch of NTLMv1 hashes.
 *
 * @param conversions - The original NTLMv1→DES conversion data
 * @param crackedDesKeys - Map from DES hashcat line → cracked DES key (hex)
 * @returns Array of results mapping original NTLMv1 hashes to recovered NTLM hashes
 */
export function processDesResults(
  conversions: Ntlmv1Conversion[],
  crackedDesKeys: Map<string, string>
): Ntlmv1Result[] {
  const results: Ntlmv1Result[] = [];

  for (const conv of conversions) {
    const desLine1 = conv.desPairs[0].hashcatLine;
    const desLine2 = conv.desPairs[1].hashcatLine;

    const key1 =
      crackedDesKeys.get(desLine1) ??
      crackedDesKeys.get(desLine1.toLowerCase()) ??
      crackedDesKeys.get(desLine1.toUpperCase());
    const key2 =
      crackedDesKeys.get(desLine2) ??
      crackedDesKeys.get(desLine2.toLowerCase()) ??
      crackedDesKeys.get(desLine2.toUpperCase());

    const part1 = key1 ? desKeyToNtlmFragment(key1) : null;
    const part2 = key2 ? desKeyToNtlmFragment(key2) : null;

    // Recover last 2 bytes via CT3 brute-force
    let part3: string | null = null;
    if (conv.parsed.isEss) {
      part3 = recoverCt3(
        conv.parsed.ct3,
        conv.parsed.challenge,
        conv.parsed.lmResponse
      );
    } else {
      part3 = recoverCt3(conv.parsed.ct3, conv.parsed.effectiveChallenge);
    }

    let ntlmHash: string | null = null;
    if (part1 && part2 && part3) {
      ntlmHash = (part1 + part2 + part3).toLowerCase();
    }

    results.push({
      originalHash: conv.parsed.raw,
      ntlmHash,
      part1,
      part2,
      part3,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// DES charset generation
// ---------------------------------------------------------------------------

/**
 * Generate the DES_full charset content (hex-encoded).
 *
 * This contains all 128 byte values that have odd parity (valid DES key bytes).
 * Used with hashcat's `--hex-charset` flag and `-1 <charset>`.
 *
 * The output is a 256-character hex string.
 */
export function generateDesFullCharset(): string {
  const validBytes: number[] = [];
  for (let i = 0; i < 256; i++) {
    let bits = 0;
    let v = i;
    while (v) {
      bits += v & 1;
      v >>= 1;
    }
    if (bits % 2 === 1) validBytes.push(i); // Odd parity
  }
  return validBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pre-computed DES_full charset */
export const DES_FULL_CHARSET = generateDesFullCharset();

/** Hashcat mask for DES brute-force: 8 bytes from custom charset 1 */
export const DES_BRUTE_FORCE_MASK = "?1?1?1?1?1?1?1?1";

// ---------------------------------------------------------------------------
// Hash type detection
// ---------------------------------------------------------------------------

/** NTLMv1 hash types that should trigger the DES conversion pipeline */
export const NTLMV1_HASH_TYPES = [5500, 27000] as const;

/** Check if a hash type is NTLMv1 and should use the DES conversion pipeline */
export function isNtlmv1HashType(hashType: number): boolean {
  return (NTLMV1_HASH_TYPES as readonly number[]).includes(hashType);
}
