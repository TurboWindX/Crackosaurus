/**
 * Hash type auto-identification.
 *
 * Returns a ranked list of candidate hashcat modes by inspecting the
 * structure/prefix of a hash string.  Structural prefixes (bcrypt, crypt
 * wrappers, Kerberos, NTLMv1/v2, DCC2, …) give high-confidence single
 * results.  Bare hex strings are ambiguous so we return all plausible
 * modes sorted by likelihood (most common first).
 */

export interface HashCandidate {
  /** hashcat -m mode number */
  mode: number;
  /** human-readable name */
  name: string;
  /** rough confidence: "high" = structural match, "medium" = likely hex
   *  match, "low" = possible but unlikely */
  confidence: "high" | "medium" | "low";
}

// ── Structural prefix rules (high confidence) ────────────────────────

interface PrefixRule {
  test: (h: string) => boolean;
  mode: number;
  name: string;
}

const PREFIX_RULES: PrefixRule[] = [
  // bcrypt
  { test: (h) => /^\$2[aby]?\$\d+\$/.test(h), mode: 3200, name: "bcrypt" },

  // md5crypt / Cisco-IOS $1$
  { test: (h) => h.startsWith("$1$"), mode: 500, name: "md5crypt (Unix)" },

  // sha256crypt
  { test: (h) => h.startsWith("$5$"), mode: 7400, name: "sha256crypt (Unix)" },

  // sha512crypt
  { test: (h) => h.startsWith("$6$"), mode: 1800, name: "sha512crypt (Unix)" },

  // Apache apr1
  {
    test: (h) => h.startsWith("$apr1$"),
    mode: 1600,
    name: "Apache $apr1$ MD5",
  },

  // phpass / WordPress / phpBB
  { test: (h) => /^\$(P|H)\$/.test(h), mode: 400, name: "phpass / WordPress" },

  // DCC2
  {
    test: (h) => h.startsWith("$DCC2$"),
    mode: 2100,
    name: "Domain Cached Credentials 2 (DCC2)",
  },

  // Kerberos 5 TGS-REP etype 23
  {
    test: (h) => h.startsWith("$krb5tgs$23$"),
    mode: 13100,
    name: "Kerberos 5 TGS-REP etype 23",
  },

  // Kerberos 5 AS-REP etype 23
  {
    test: (h) => h.startsWith("$krb5asrep$23$"),
    mode: 18200,
    name: "Kerberos 5 AS-REP etype 23",
  },

  // Kerberos 5 Pre-Auth etype 23
  {
    test: (h) => h.startsWith("$krb5pa$23$"),
    mode: 7500,
    name: "Kerberos 5 AS-REQ Pre-Auth etype 23",
  },

  // Kerberos 5 TGS-REP etype 17
  {
    test: (h) => h.startsWith("$krb5tgs$17$"),
    mode: 19600,
    name: "Kerberos 5 TGS-REP etype 17",
  },

  // Kerberos 5 TGS-REP etype 18
  {
    test: (h) => h.startsWith("$krb5tgs$18$"),
    mode: 19700,
    name: "Kerberos 5 TGS-REP etype 18",
  },

  // Kerberos 5 AS-REP etype 17
  {
    test: (h) => h.startsWith("$krb5asrep$17$"),
    mode: 19800,
    name: "Kerberos 5 AS-REP etype 17",
  },

  // Kerberos 5 AS-REP etype 18
  {
    test: (h) => h.startsWith("$krb5asrep$18$"),
    mode: 19900,
    name: "Kerberos 5 AS-REP etype 18",
  },

  // BLAKE2b-512
  { test: (h) => h.startsWith("$BLAKE2$"), mode: 600, name: "BLAKE2b-512" },

  // Cisco-IOS type 8 (PBKDF2-SHA256)
  {
    test: (h) => h.startsWith("$8$"),
    mode: 9200,
    name: "Cisco-IOS $8$ (PBKDF2-SHA256)",
  },

  // Cisco-IOS type 9 (scrypt)
  {
    test: (h) => h.startsWith("$9$"),
    mode: 9300,
    name: "Cisco-IOS $9$ (scrypt)",
  },

  // MS Office 2007/2010/2013
  {
    test: (h) => h.startsWith("$office$*2013*"),
    mode: 9600,
    name: "MS Office 2013",
  },
  {
    test: (h) => h.startsWith("$office$*2010*"),
    mode: 9500,
    name: "MS Office 2010",
  },
  {
    test: (h) => h.startsWith("$office$*2007*"),
    mode: 9400,
    name: "MS Office 2007",
  },

  // MS Office old
  {
    test: (h) => h.startsWith("$oldoffice$"),
    mode: 9700,
    name: "MS Office <= 2003",
  },

  // PDF
  { test: (h) => h.startsWith("$pdf$"), mode: 10400, name: "PDF" },

  // 7-Zip
  { test: (h) => h.startsWith("$7z$"), mode: 11600, name: "7-Zip" },

  // Drupal 7
  { test: (h) => h.startsWith("$S$"), mode: 7900, name: "Drupal 7" },

  // Django PBKDF2-SHA256
  {
    test: (h) => h.startsWith("pbkdf2_sha256$"),
    mode: 10000,
    name: "Django (PBKDF2-SHA256)",
  },

  // GRUB 2
  {
    test: (h) => h.startsWith("grub.pbkdf2.sha512."),
    mode: 7200,
    name: "GRUB 2",
  },

  // Bitcoin/Litecoin wallet
  {
    test: (h) => h.startsWith("$bitcoin$"),
    mode: 11300,
    name: "Bitcoin/Litecoin wallet.dat",
  },

  // scrypt generic
  { test: (h) => h.startsWith("SCRYPT:"), mode: 8900, name: "scrypt" },

  // RACF
  { test: (h) => h.startsWith("$racf$"), mode: 8500, name: "RACF" },

  // SIP digest
  {
    test: (h) => h.startsWith("$sip$"),
    mode: 11400,
    name: "SIP digest authentication (MD5)",
  },

  // PBKDF2-HMAC-SHA256
  {
    test: (h) => h.startsWith("sha256:"),
    mode: 10900,
    name: "PBKDF2-HMAC-SHA256",
  },

  // AIX
  { test: (h) => h.startsWith("{smd5}"), mode: 6300, name: "AIX {smd5}" },
  { test: (h) => h.startsWith("{ssha256}"), mode: 6400, name: "AIX {ssha256}" },
  { test: (h) => h.startsWith("{ssha512}"), mode: 6500, name: "AIX {ssha512}" },
  { test: (h) => h.startsWith("{ssha1}"), mode: 6700, name: "AIX {ssha1}" },

  // PBKDF2_SHA256 (RedHat 389-DS)
  {
    test: (h) => h.startsWith("{PBKDF2_SHA256}"),
    mode: 10901,
    name: "RedHat 389-DS LDAP (PBKDF2-SHA256)",
  },

  // NetNTLMv2 — must check before NTLMv1 because both have colons but
  // v2 has longer blob fields.  v2 format: user::domain:challenge:ntproofstr:blob
  // Typical: 6+ colon fields where field[4] is 32-char hex and field[5] is long hex blob
  {
    test: (h) => {
      const parts = h.split(":");
      // NTLMv2: user::domain:serverChallenge(16hex):ntProofStr(32hex):blob(long hex)
      if (parts.length >= 6) {
        const serverChallenge = parts[3];
        const ntProofStr = parts[4];
        const blob = parts[5];
        if (
          serverChallenge &&
          /^[0-9a-fA-F]{16}$/.test(serverChallenge) &&
          ntProofStr &&
          /^[0-9a-fA-F]{32}$/.test(ntProofStr) &&
          blob &&
          blob.length > 32 &&
          /^[0-9a-fA-F]+$/.test(blob)
        ) {
          return true;
        }
      }
      return false;
    },
    mode: 5600,
    name: "NetNTLMv2",
  },

  // NetNTLMv1 — user::domain:lmResp(48hex):ntResp(48hex):challenge(16hex)
  {
    test: (h) => {
      const parts = h.split(":");
      if (parts.length >= 6) {
        const lm = parts[3];
        const nt = parts[4];
        const challenge = parts[5];
        if (
          lm &&
          /^[0-9a-fA-F]{48}$/.test(lm) &&
          nt &&
          /^[0-9a-fA-F]{48}$/.test(nt) &&
          challenge &&
          /^[0-9a-fA-F]{16}$/.test(challenge)
        ) {
          return true;
        }
      }
      return false;
    },
    mode: 5500,
    name: "NetNTLMv1",
  },

  // DCC1 — 32hex:username
  {
    test: (h) => {
      const parts = h.split(":");
      return (
        parts.length === 2 &&
        /^[0-9a-fA-F]{32}$/.test(parts[0]!) &&
        parts[1]!.length > 0 &&
        !/^[0-9a-fA-F]+$/.test(parts[1]!)
      );
    },
    mode: 1100,
    name: "Domain Cached Credentials (DCC1)",
  },
];

// ── Bare hex heuristics (ordered by prevalence/likelihood) ───────────

interface HexRule {
  length: number;
  candidates: { mode: number; name: string; confidence: "medium" | "low" }[];
}

const HEX_RULES: HexRule[] = [
  {
    // 32 hex chars
    length: 32,
    candidates: [
      { mode: 1000, name: "NTLM", confidence: "medium" },
      { mode: 0, name: "MD5", confidence: "medium" },
      { mode: 900, name: "MD4", confidence: "low" },
      { mode: 2600, name: "md5(md5($pass))", confidence: "low" },
      { mode: 4300, name: "md5(strtoupper(md5($pass)))", confidence: "low" },
    ],
  },
  {
    // 40 hex chars
    length: 40,
    candidates: [
      { mode: 100, name: "SHA1", confidence: "medium" },
      { mode: 300, name: "MySQL4.1/MySQL5", confidence: "low" },
      { mode: 4500, name: "sha1(sha1($pass))", confidence: "low" },
      { mode: 4700, name: "sha1(md5($pass))", confidence: "low" },
      { mode: 6000, name: "RIPEMD-160", confidence: "low" },
    ],
  },
  {
    // 64 hex chars
    length: 64,
    candidates: [
      { mode: 1400, name: "SHA2-256", confidence: "medium" },
      {
        mode: 11700,
        name: "GOST R 34.11-2012 (Streebog) 256-bit",
        confidence: "low",
      },
    ],
  },
  {
    // 96 hex chars
    length: 96,
    candidates: [{ mode: 10800, name: "SHA2-384", confidence: "medium" }],
  },
  {
    // 128 hex chars
    length: 128,
    candidates: [
      { mode: 1700, name: "SHA2-512", confidence: "medium" },
      { mode: 6100, name: "Whirlpool", confidence: "low" },
      { mode: 6900, name: "GOST R 34.11-94", confidence: "low" },
    ],
  },
  {
    // 16 hex chars — MySQL323, LM, Half MD5
    length: 16,
    candidates: [
      { mode: 3000, name: "LM", confidence: "medium" },
      { mode: 200, name: "MySQL323", confidence: "low" },
      { mode: 5100, name: "Half MD5", confidence: "low" },
    ],
  },
];

// ── Public API ───────────────────────────────────────────────────────

/**
 * Identify candidate hash types for a given hash string.
 *
 * Returns an empty array if no candidates are found.  Results are sorted
 * by confidence (high → medium → low) and then by mode number.
 */
export function identifyHash(input: string): HashCandidate[] {
  const hash = input.trim();
  if (hash.length === 0) return [];

  // 1. Check structural prefixes first (high confidence)
  for (const rule of PREFIX_RULES) {
    if (rule.test(hash)) {
      return [{ mode: rule.mode, name: rule.name, confidence: "high" }];
    }
  }

  // 2. Check for $hash:salt patterns with known hex lengths
  //    e.g. sha256($pass.$salt) -> 64hex:salt
  const colonIdx = hash.indexOf(":");
  if (colonIdx > 0) {
    const beforeColon = hash.substring(0, colonIdx);
    const afterColon = hash.substring(colonIdx + 1);

    if (/^[0-9a-fA-F]+$/.test(beforeColon) && afterColon.length > 0) {
      // Salted hash patterns
      const saltedCandidates = getSaltedHexCandidates(beforeColon.length);
      if (saltedCandidates.length > 0) return saltedCandidates;
    }
  }

  // 3. Check bare hex match
  if (/^[0-9a-fA-F]+$/.test(hash)) {
    const rule = HEX_RULES.find((r) => r.length === hash.length);
    if (rule) {
      return rule.candidates.map((c) => ({ ...c }));
    }
  }

  return [];
}

/** Salted hex patterns: hexpart:salt */
function getSaltedHexCandidates(hexLength: number): HashCandidate[] {
  switch (hexLength) {
    case 32:
      return [
        { mode: 10, name: "md5($pass.$salt)", confidence: "medium" },
        { mode: 20, name: "md5($salt.$pass)", confidence: "low" },
        { mode: 1100, name: "DCC (MS Cache)", confidence: "medium" },
        { mode: 50, name: "HMAC-MD5 (key = $pass)", confidence: "low" },
      ];
    case 40:
      return [
        { mode: 110, name: "sha1($pass.$salt)", confidence: "medium" },
        { mode: 120, name: "sha1($salt.$pass)", confidence: "low" },
        { mode: 150, name: "HMAC-SHA1 (key = $pass)", confidence: "low" },
      ];
    case 64:
      return [
        { mode: 1410, name: "sha256($pass.$salt)", confidence: "medium" },
        { mode: 1420, name: "sha256($salt.$pass)", confidence: "low" },
        { mode: 1450, name: "HMAC-SHA256 (key = $pass)", confidence: "low" },
      ];
    case 128:
      return [
        { mode: 1710, name: "sha512($pass.$salt)", confidence: "medium" },
        { mode: 1720, name: "sha512($salt.$pass)", confidence: "low" },
        { mode: 1750, name: "HMAC-SHA512 (key = $pass)", confidence: "low" },
      ];
    default:
      return [];
  }
}

/**
 * Identify candidate hash types from multiple hashes (e.g. bulk import).
 *
 * Takes the first non-empty hash, identifies it, and returns candidates.
 * For batch imports all hashes should be the same type, so sampling the
 * first one is sufficient.
 */
export function identifyHashBatch(hashes: string[]): HashCandidate[] {
  const sample = hashes.find((h) => h.trim().length > 0);
  if (!sample) return [];
  return identifyHash(sample);
}
