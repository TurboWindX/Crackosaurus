# Vendored: ConfigMgr CryptDeriveKey hashcat module (mode 19850)

Third-party source, vendored verbatim and compiled into the GPU-box hashcat
build (see `packages/container/instance/aws/Containerfile`).

- **Upstream:** https://github.com/MWR-CyberSec/configmgr-cryptderivekey-hashcat-module
- **Commit/ref:** `main` (default branch)
- **Fetched:** 2026-11-17
- **License:** MIT — Copyright (c) 2022 Christopher Panayi, MWR CyberSec (see `LICENSE`)
- **Target hashcat version:** developed against 6.2.5/6.2.6 (we build 6.2.6)

## What it cracks

The password used to derive an AES-128 key with `CryptDeriveKey` (Windows
CryptoAPI) for ConfigMgr (SCCM) media-variable files. Hashes are produced by
PXEThief: `pxethief 5 <media variables file>`.

- **Mode:** `-m 19850`
- **Signature / format:** `$sccm$aes128$<32 hex header><8 hex ALG_ID=0000660e><8 hex header><32 hex ciphertext>` (93 chars)
- **Self-test:** `$sccm$aes128$0000edec14000000b2320000c03200000e6600000000000011cb54aa3b699f61f86ab312e6fb97ec` → `Password1`
- Not salted, not iterated — a *fast* hash (standard a0/a1/a3 wordlist/combinator/mask attacks).

## Algorithm

`SHA1(UTF-16LE(password))` → CryptDeriveKey ipad expansion → first 16 bytes =
AES-128 key → encrypt one fixed plaintext block (`"<?xml ve"`) → compare against
the ciphertext in the hash line.

## Files

- `module_code/module_19850.c` → built into `modules/module_19850.so`
- `opencl_code/m19850_a0-pure.cl` (straight), `m19850_a1-pure.cl` (combinator),
  `m19850_a3-pure.cl` (mask) → placed in `OpenCL/`, JIT-compiled at runtime

## Local patches

All patches exist because the module was written for 6.2.5 and we build 6.2.6.
Revert them only if ever building against ≤ 6.2.5.

- `module_code/module_19850.c` `token_t` → `hc_token_t`. 6.2.6 renamed this
  struct type. Same struct, same members — no behaviour change.
- `module_code/module_19850.c` module_register: added
  `module_benchmark_charset` and `module_hash_decode_postprocess`, both set to
  `MODULE_DEFAULT`. 6.2.6 added these two `module_ctx_t` fields and pre-fills
  the context with a sentinel, then rejects the module ("Missing symbol
  definitions ... Old template?") if any field is left unassigned. Setting them
  to `MODULE_DEFAULT` = the module opts out of both, same as every stock
  fast-hash module — no behaviour change.

## Updating

Re-fetch the four files from upstream into this directory, update the
**Fetched**/**Commit** fields above, and rebuild the instance image. The
`.cl` includes are all stock hashcat headers, so no extra deps are needed.
