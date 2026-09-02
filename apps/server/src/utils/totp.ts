import crypto from "crypto";

import bcrypt from "bcrypt";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

import config from "../config";

// TOTP parameters. SHA1 / 6 digits / 30s is the RFC 6238 baseline that every
// authenticator app (Google Authenticator, Authy, 1Password, …) supports.
const ISSUER = "Crackosaurus";
const ALGORITHM = "SHA1";
const DIGITS = 6;
const PERIOD = 30;
// Accept codes from the adjacent time steps as well as the current one, to
// tolerate clock skew between the server and the user's device (±1 step = ±30s).
const VALIDATION_WINDOW = 1;

// Number of one-time recovery codes issued when MFA is confirmed.
const RECOVERY_CODE_COUNT = 10;
const BCRYPT_COST = 12;

// ── TOTP secret / code ──────────────────────────────────────────────────────

/** Generate a fresh 160-bit TOTP secret, returned as its base32 encoding. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function buildTotp(secretBase32: string, username: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/**
 * Build the `otpauth://totp/...` provisioning URI for a secret. This is what
 * the QR code encodes and what a user can type in manually as a fallback.
 */
export function buildTotpUri(secretBase32: string, username: string): string {
  return buildTotp(secretBase32, username).toString();
}

/** Render a provisioning URI to a PNG data URL for display in an <img>. */
export function qrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

/**
 * Validate a user-supplied TOTP token against a secret. Tolerates surrounding
 * whitespace and clock skew of ±1 time step.
 *
 * Returns the *absolute* time-step the token matched (`floor(now/period)` shifted
 * by the skew delta), or `null` if the token is invalid. Callers persist the
 * returned step and reject any later code whose step is not strictly greater,
 * making each code single-use within its validity window (RFC 6238 §5.2).
 */
export function verifyTotp(secretBase32: string, token: string): number | null {
  const normalized = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;

  const delta = buildTotp(secretBase32, ISSUER).validate({
    token: normalized,
    window: VALIDATION_WINDOW,
  });
  if (delta === null) return null;

  // OTPAuth returns the offset from the current counter; add it back to recover
  // the absolute step of the matched code. `floor(now/1000/period)` equals
  // OTPAuth's own current counter, so `+ delta` yields the matched step.
  return Math.floor(Date.now() / 1000 / PERIOD) + delta;
}

// ── Secret encryption at rest (AES-256-GCM) ──────────────────────────────────
//
// The TOTP secret must be reversible (we need the plaintext to compute the
// expected code), so it is encrypted rather than hashed. The key is derived
// from BACKEND_SECRET via HKDF — no new secret to manage, and a DB-only
// compromise yields ciphertext that is useless without BACKEND_SECRET.

const ENCRYPTION_VERSION = "v1";

function getEncryptionKey(): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(config.secret, "utf-8"),
      Buffer.from("crackosaurus-totp-salt"),
      Buffer.from("crackosaurus-totp-secret-encryption"),
      32
    )
  );
}

/** Encrypt a base32 TOTP secret for storage. Format: `v1:<iv>:<tag>:<ct>` b64. */
export function encryptSecret(plainBase32: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainBase32, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a stored TOTP secret back to its base32 form. Throws if the payload
 * is malformed, the version is unknown, or the auth tag fails (tamper / wrong
 * key). Callers treat a throw as "MFA misconfigured" rather than "code wrong".
 */
export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (
    version !== ENCRYPTION_VERSION ||
    ivB64 === undefined ||
    tagB64 === undefined ||
    ctB64 === undefined
  )
    throw new Error("Malformed encrypted TOTP secret");

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf-8");
}

// ── Recovery codes ───────────────────────────────────────────────────────────

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Generate a batch of human-friendly one-time recovery codes (64-bit entropy
 * each), formatted `xxxx-xxxx-xxxx-xxxx`. Returned in plaintext for one-time
 * display to the user; only their hashes are persisted.
 */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const hex = crypto.randomBytes(8).toString("hex"); // 16 hex chars
    return hex.replace(/(.{4})(?=.)/g, "$1-");
  });
}

/** bcrypt-hash a recovery code for storage. Normalizes formatting first. */
export function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), BCRYPT_COST);
}

/** Constant-time-ish check of a supplied recovery code against a stored hash. */
export function checkRecoveryCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(normalizeRecoveryCode(code), hash);
}
