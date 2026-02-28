/**
 * Hash Shucking — NT-candidate mode support
 *
 * "Shucking" uses known NTLM (NT) hashes as a wordlist against outer-layer
 * hash formats in hashcat's NT-candidate modes. This strips the outer
 * cryptographic wrapping and proves password reuse without recovering
 * the plaintext from the slow outer algorithm.
 *
 * Reference: https://trustedsec.com/blog/holy-shuck-weaponizing-ntlm-hashes-as-a-wordlist
 * Hashcat docs: https://hashcat.net/wiki/doku.php?id=hashcat
 */
import { HASH_TYPES } from "./data";

// ── Shuckable hash-type mapping ──────────────────────────────────────────
// Each entry maps a "normal" hashcat mode to its NT-candidate counterpart.
// When a job targets one of these hash types, a shuck pass can be run first
// using known NTLM hashes as the wordlist.

export interface ShuckMapping {
  /** The standard hashcat mode (password-based) */
  normalMode: number;
  /** The NT-candidate hashcat mode */
  ntMode: number;
  /** Human-readable label */
  label: string;
}

export const SHUCK_MODES: ShuckMapping[] = [
  { normalMode: 5500, ntMode: 27000, label: "NetNTLMv1 / NetNTLMv1+ESS" },
  { normalMode: 5600, ntMode: 27100, label: "NetNTLMv2" },
  { normalMode: 1100, ntMode: 31500, label: "Domain Cached Credentials (DCC)" },
  {
    normalMode: 2100,
    ntMode: 31600,
    label: "Domain Cached Credentials 2 (DCC2)",
  },
  { normalMode: 13100, ntMode: 35300, label: "Kerberos 5, etype 23, TGS-REP" },
  { normalMode: 18200, ntMode: 35400, label: "Kerberos 5, etype 23, AS-REP" },
];

/** Fast lookup: normalMode → ntMode */
const SHUCK_MODE_MAP = new Map<number, number>(
  SHUCK_MODES.map((m) => [m.normalMode, m.ntMode])
);

/**
 * Get the NT-candidate hashcat mode for a given hash type.
 * Returns `null` if the hash type is not shuckable.
 */
export function getShuckMode(hashType: number): number | null {
  return SHUCK_MODE_MAP.get(hashType) ?? null;
}

/**
 * Returns `true` if the hash type supports NT-candidate shucking.
 */
export function isShuckableHashType(hashType: number): boolean {
  return SHUCK_MODE_MAP.has(hashType);
}

/**
 * The hash type used for NTLM hashes in the KnownHash table.
 * These are the "inner" hashes used as the shuck wordlist.
 */
export const NTLM_HASH_TYPE = HASH_TYPES.ntlm; // 1000

/** Filename for the NT hash wordlist written to the job folder on EFS */
export const NT_WORDLIST_FILE = "nt-wordlist.txt";

/** Filename for shuck results (target hash → matched NT hash) */
export const SHUCK_RESULTS_FILE = "shuck-results.json";

/** Filename for the shuck potfile (hashcat output from shuck phase) */
export const SHUCK_POT_FILE = "shuck-output.pot";
