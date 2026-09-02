export const HASH_TYPES = {
  md5: 0,
  hmac_md5: 50,
  sha1: 100,
  hmac_sha1: 150,
  ntlm: 1000,
  sha256: 1400,
  hmac_sha256: 1450,
  bcrypt: 3200,
  netntlmv1: 5500,
  netntlmv2: 5600,
  des: 14000,
  netntlmv1_nt: 27000,
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

// Hashcat modes whose per-guess cost is high — iterated KDFs, memory-hard
// functions, and disk/document/wallet encryption. On these, throughput is
// measured in hashes/second to thousands/second even across multiple GPUs
// (vs. billions/second for fast hashes like MD5/NTLM/SHA1), so a large wordlist
// combined with a large ruleset can take days, months, or effectively forever.
// Used to surface a UI warning. Deliberately conservative: a mode not listed
// here is treated as "fast" (no warning) rather than risk a false alarm.
export const SLOW_HASH_MODES: ReadonlySet<number> = new Set<number>([
  // ── Iterated password hashes (Unix crypt & web frameworks) ──
  400, // phpass (WordPress, phpBB3, Joomla)
  500, // md5crypt ($1$) / FreeBSD
  1800, // sha512crypt ($6$)
  7400, // sha256crypt ($5$)
  3200, // bcrypt ($2*$, Blowfish)
  7900, // Drupal7
  // ── PBKDF2 families ──
  2100, // Domain Cached Credentials 2 (DCC2 / mscash2)
  5800, // Samsung Android Password/PIN
  6800, // LastPass
  7100, // macOS v10.8+ (PBKDF2-SHA512)
  8200, // 1Password, cloudkeychain
  9200, // Cisco-IOS $8$ (PBKDF2-SHA256)
  10000, // Django (PBKDF2-SHA256)
  10900, // PBKDF2-HMAC-SHA256
  12000, // PBKDF2-HMAC-SHA1
  12100, // PBKDF2-HMAC-SHA512
  16900, // Ansible Vault
  // ── Memory-hard (scrypt) ──
  8900, // scrypt
  9300, // Cisco-IOS $9$ (scrypt)
  15700, // Ethereum Wallet, SCRYPT
  22700, // MultiBit HD (scrypt)
  // ── WPA / WiFi ──
  2500, // WPA-EAPOL-PBKDF2 (deprecated)
  2501, // WPA-EAPOL-PMK
  16800, // WPA-PMKID-PBKDF2
  22000, // WPA-PBKDF2-PMKID+EAPOL
  22001, // WPA-PMK-PMKID+EAPOL
  // ── Full-disk / archive encryption ──
  14600, // LUKS
  11600, // 7-Zip
  12500, // RAR3-hp
  13000, // RAR5
  23700, // RAR3-p (uncompressed)
  23800, // RAR3-p (compressed)
  // ── Office / PDF documents ──
  9400, // MS Office 2007
  9500, // MS Office 2010
  9600, // MS Office 2013
  25300, // MS Office 2016 - SheetProtection
  10500, // PDF 1.4-1.6 (Acrobat 5-8)
  10600, // PDF 1.7 Level 3 (Acrobat 9)
  10700, // PDF 1.7 Level 8 (Acrobat 10-11)
  // ── Wallets / password managers ──
  11300, // Bitcoin/Litecoin wallet.dat
  13400, // KeePass 1/2
  12700, // Blockchain, My Wallet
  15200, // Blockchain, My Wallet, V2
  16300, // Ethereum Pre-Sale Wallet (PBKDF2)
  23400, // Bitwarden
  26600, // MetaMask
  // ── Kerberos AES etypes (17/18 use PBKDF2) ──
  19600, // Kerberos 5, etype 17, TGS-REP
  19700, // Kerberos 5, etype 18, TGS-REP
  19800, // Kerberos 5, etype 17, Pre-Auth
  19900, // Kerberos 5, etype 18, Pre-Auth
]);

// Contiguous hashcat mode ranges for slow container-encryption families whose
// many sub-variants (hash+cipher combinations) are all iterated KDFs.
const SLOW_HASH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [6211, 6243], // TrueCrypt
  [13711, 13783], // VeraCrypt
];

/**
 * Returns `true` if the hashcat mode is a "slow"/robust hash — an iterated KDF,
 * memory-hard function, or disk/document/wallet encryption — where cracking is
 * orders of magnitude slower than fast hashes (MD5, NTLM, SHA1, SHA256). On
 * these, a large wordlist combined with a large ruleset can take days to
 * forever, even across multiple GPUs. Drives the UI "this may take a very long
 * time" warning.
 */
export function isSlowHashType(mode: number): boolean {
  if (SLOW_HASH_MODES.has(mode)) return true;
  return SLOW_HASH_RANGES.some(([lo, hi]) => mode >= lo && mode <= hi);
}

export function parseHashcatPot(data: string): Record<string, string> {
  return Object.fromEntries(
    data
      .split("\n")
      .filter((row) => row.trim().length > 0)
      .map((row) => {
        // Split on the LAST colon so hash formats containing colons
        // (e.g. NTLMv1 "user::domain:lm:nt:challenge", DES "ct:salt")
        // are kept intact as the key.
        const lastColon = row.lastIndexOf(":");
        if (lastColon === -1) return [row, ""];
        return [row.substring(0, lastColon), row.substring(lastColon + 1)];
      })
  );
}
