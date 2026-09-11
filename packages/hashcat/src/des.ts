/**
 * Minimal, dependency-free single-block DES (ECB) encryption.
 *
 * Why this exists: NetNTLMv1 verification (verifyNtlmForNetntlmv1) needs to
 * DES-encrypt the 8-byte server challenge under three NT-derived keys. That
 * verification runs inside the SERVER process (rainbow.resolve), which ships on
 * node:20-alpine → OpenSSL 3.0, where "des-ecb" is a legacy provider cipher
 * DISABLED by default: `crypto.createCipheriv("des-ecb", …)` throws
 * ERR_OSSL_EVP_UNSUPPORTED. Rather than enable the legacy provider globally
 * (which also re-enables MD2/RC4/… and weakens the whole server's crypto
 * posture), we carry this tiny textbook DES so verification is self-contained
 * and works on any Node without runtime flags.
 *
 * Scope: single-block ECB encrypt only — exactly what NetNTLMv1 needs. Parity
 * bits (each key byte's LSB) are ignored by the DES key schedule, matching
 * hashcat and the expandDesKey() convention used elsewhere in this package.
 *
 * Validated against published FIPS/textbook DES known-answer vectors (see the
 * des round-trip test); do not "optimize" the tables without re-running them.
 */

// Initial permutation.
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38,
  30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1,
  59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39,
  31, 23, 15, 7,
];

// Final permutation (inverse of IP).
const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14,
  54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28,
  35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9,
  49, 17, 57, 25,
];

// Expansion (32 → 48).
const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16,
  17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29,
  28, 29, 30, 31, 32, 1,
];

// P permutation (after S-boxes).
const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32,
  27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];

// Permuted choice 1 (64 → 56) and 2 (56 → 48).
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35,
  27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38,
  30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27,
  20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34,
  53, 46, 42, 50, 36, 29, 32,
];

const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

// prettier-ignore
const SBOX: number[][] = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7, 0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8, 4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0, 15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10, 3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5, 0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15, 13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8, 13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1, 13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7, 1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15, 13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9, 10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4, 3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9, 14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6, 4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14, 11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11, 10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8, 9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6, 4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1, 13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6, 1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2, 6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7, 1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2, 7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8, 2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

/** Bytes → array of bits (MSB first), 1 bit per element. */
function bytesToBits(buf: Buffer): number[] {
  const bits: number[] = new Array(buf.length * 8);
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    for (let j = 0; j < 8; j++) bits[i * 8 + j] = (b >> (7 - j)) & 1;
  }
  return bits;
}

/** Array of bits (MSB first) → bytes. */
function bitsToBytes(bits: number[]): Buffer {
  const out = Buffer.alloc(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j]!;
    out[i] = b;
  }
  return out;
}

/** Apply a 1-indexed permutation table to a bit array. */
function permute(bits: number[], table: number[]): number[] {
  const out: number[] = new Array(table.length);
  for (let i = 0; i < table.length; i++) out[i] = bits[table[i]! - 1]!;
  return out;
}

/** Build the 16 × 48-bit round subkeys from an 8-byte key. */
function keySchedule(key8: Buffer): number[][] {
  const k = permute(bytesToBits(key8), PC1); // 56 bits
  let c = k.slice(0, 28);
  let d = k.slice(28, 56);
  const subkeys: number[][] = [];
  for (let round = 0; round < 16; round++) {
    const s = SHIFTS[round]!;
    c = c.slice(s).concat(c.slice(0, s));
    d = d.slice(s).concat(d.slice(0, s));
    subkeys.push(permute(c.concat(d), PC2));
  }
  return subkeys;
}

/**
 * DES-ECB encrypt exactly one 8-byte block with an 8-byte key.
 * @throws if either buffer is not 8 bytes.
 */
export function desEcbEncryptBlock(key8: Buffer, data8: Buffer): Buffer {
  if (key8.length !== 8) throw new Error(`DES key must be 8 bytes, got ${key8.length}`);
  if (data8.length !== 8) throw new Error(`DES block must be 8 bytes, got ${data8.length}`);

  const subkeys = keySchedule(key8);
  const ip = permute(bytesToBits(data8), IP);
  let l = ip.slice(0, 32);
  let r = ip.slice(32, 64);

  for (let round = 0; round < 16; round++) {
    const expanded = permute(r, E); // 48 bits
    const sk = subkeys[round]!;
    const xored: number[] = new Array(48);
    for (let i = 0; i < 48; i++) xored[i] = expanded[i]! ^ sk[i]!;

    // 8 S-boxes: 6 bits → 4 bits.
    const sboxOut: number[] = new Array(32);
    for (let b = 0; b < 8; b++) {
      const off = b * 6;
      const row = (xored[off]! << 1) | xored[off + 5]!;
      const col =
        (xored[off + 1]! << 3) |
        (xored[off + 2]! << 2) |
        (xored[off + 3]! << 1) |
        xored[off + 4]!;
      const val = SBOX[b]![row * 16 + col]!;
      sboxOut[b * 4] = (val >> 3) & 1;
      sboxOut[b * 4 + 1] = (val >> 2) & 1;
      sboxOut[b * 4 + 2] = (val >> 1) & 1;
      sboxOut[b * 4 + 3] = val & 1;
    }

    const f = permute(sboxOut, P); // 32 bits
    const newR: number[] = new Array(32);
    for (let i = 0; i < 32; i++) newR[i] = l[i]! ^ f[i]!;
    l = r;
    r = newR;
  }

  // Preoutput is R16 ‖ L16 (note the swap), then final permutation.
  return bitsToBytes(permute(r.concat(l), FP));
}
