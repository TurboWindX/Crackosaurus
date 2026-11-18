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
- `opencl_code/m19850_a{0,1,3}-pure.cl` include form: `#include "inc_X"` →
  `#include M2S(INCLUDE_PATH/inc_X)`. 6.2.6 compiles kernels with a two-step
  clCompileProgram and resolves includes via the injected `INCLUDE_PATH`
  macro; the old plain-quoted includes fail to resolve ("'inc_vendor.h' file
  not found") so the kernel never builds.
- `opencl_code/m19850_a{0,1,3}-pure.cl` renamed kernel constants to their
  6.2.6 names: `gid_max`→`GID_CNT`, `il_cnt`→`IL_CNT`,
  `DIGESTS_OFFSET`→`DIGESTS_OFFSET_HOST` (defined in inc_types.h). Without this
  the kernel fails to compile ("use of undeclared identifier").

- a3 (mask) kernel runs at vector width 1 only. `m19850_a3-pure.cl` declares
  SIMD (`NEW_SIMD_CODE`, `u32x`) but only processes lane 0 of the vector hash
  (`aes_key[i] = sha1_hmac_ctx_vec.ipad.h[i]` takes lane 0 + one scalar AES), so
  it is correct only at `VECT_SIZE=1`. On a backend that picks a wider vector it
  fails to compile (vector->scalar assignment) or would silently skip
  VECT_SIZE-1 candidates per iteration. The kernel is left as-is (a comment
  marks the constraint); instead the launcher forces `--backend-vector-width 1`
  for mode 19850 (`SCALAR_VECTOR_WIDTH_MODES` in packages/hashcat/src/optimized.ts,
  applied in exe.ts). CUDA GPUs typically use width 1 already, so this is free
  there. A proper upstream fix would loop over lanes (scalar AES per lane,
  `COMPARE_M_SIMD`). Verified: a0/a1/a3 all compile and crack at width 1 on a
  wide-SIMD (AVX512 PoCL) backend.

  IMPORTANT: these two `.cl` patches are required for mode 19850 to RUN. The
  kernels JIT-compile on the device at crack time, not during the module .so
  build, so a missing patch isn't caught by building the image or by
  `--example-hashes` — only by an actual `-m 19850` crack. Verified locally:
  self-test passes and the ST_HASH cracks to `Password1` on hashcat 6.2.6.

## Updating

Re-fetch the four files from upstream into this directory, update the
**Fetched**/**Commit** fields above, and rebuild the instance image. The
`.cl` includes are all stock hashcat headers, so no extra deps are needed.
