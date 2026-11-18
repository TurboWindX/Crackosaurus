#!/usr/bin/env node
/**
 * Decrypt an SCCM OSD task-sequence media-variables file with a password
 * cracked via hashcat `-m 19850` (ConfigMgr CryptDeriveKey). Pure Node
 * `crypto`, no dependencies — runs from a fresh clone.
 *
 * Usage:
 *   node scripts/decrypt-sccm.mjs --file <path> --password <pw>
 *   node scripts/decrypt-sccm.mjs --file <path> --password <pw> --json
 *   node scripts/decrypt-sccm.mjs --file <path> --password <pw> --vars-only
 *
 * The algorithm is the one hashcat module 19850 verifies against; the module
 * itself lives at packages/hashcat/src/sccm.ts (with unit tests).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const opts = { file: null, password: null, json: false, varsOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" || a === "-f") opts.file = argv[++i];
    else if (a === "--password" || a === "-p") opts.password = argv[++i];
    else if (a === "--json") opts.json = true;
    else if (a === "--vars-only") opts.varsOnly = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function usage() {
  console.error(
    "Usage: decrypt-sccm.mjs --file <variables.dat> --password <pw> [--json] [--vars-only]"
  );
  process.exit(2);
}

function deriveKey(password) {
  const h = crypto
    .createHash("sha1")
    .update(Buffer.from(password, "utf16le"))
    .digest();
  const padded = Buffer.alloc(64);
  h.copy(padded);
  const ipad = Buffer.from(padded.map((b) => b ^ 0x36));
  return crypto.createHash("sha1").update(ipad).digest().subarray(0, 16);
}

function decrypt(file, password) {
  if (file.length < 24 + 16) throw new Error("file too short");
  const algId = file.readUInt32LE(16);
  if (algId !== 0x0000660e)
    throw new Error(
      `ALG_ID is 0x${algId.toString(16)}, not CALG_AES_128 (0x660e)`
    );
  const ctAll = file.subarray(24);
  const ct = ctAll.subarray(0, Math.floor(ctAll.length / 16) * 16);
  const key = deriveKey(password);
  const d = crypto.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0));
  d.setAutoPadding(false);
  const raw = Buffer.concat([d.update(ct), d.final()]);

  const header = Buffer.from("<?xml ve", "utf16le");
  if (!raw.subarray(0, 16).equals(header))
    throw new Error("wrong password (decrypted header is not `<?xml ve`)");

  const padLen = raw[raw.length - 1];
  const pt =
    padLen >= 1 && padLen <= 16 ? raw.subarray(0, raw.length - padLen) : raw;
  return pt.toString("utf16le");
}

function parseVars(xml) {
  const out = {};
  const re = /<(variable|var)[^>]*\sname="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) out[m[2]] = m[3];
  return out;
}

const HIGH_VALUE = [
  "OSDJoinAccount",
  "OSDJoinPassword",
  "OSDJoinDomainName",
  "NetworkAccessUsername",
  "NetworkAccessPassword",
];

const opts = parseArgs(process.argv.slice(2));
if (opts.help || !opts.file || opts.password == null) usage();

const buf = fs.readFileSync(path.resolve(opts.file));
let xml;
try {
  xml = decrypt(buf, opts.password);
} catch (e) {
  console.error(`decrypt failed: ${e.message}`);
  process.exit(1);
}

if (opts.json) {
  const vars = parseVars(xml);
  console.log(JSON.stringify({ xml, variables: vars }, null, 2));
} else if (opts.varsOnly) {
  const vars = parseVars(xml);
  // Surface credential fields first; then every other var.
  const seen = new Set();
  for (const k of HIGH_VALUE) {
    if (k in vars) {
      console.log(`${k}=${vars[k]}`);
      seen.add(k);
    }
  }
  for (const [k, v] of Object.entries(vars)) {
    if (!seen.has(k)) console.log(`${k}=${v}`);
  }
} else {
  process.stdout.write(xml);
}
