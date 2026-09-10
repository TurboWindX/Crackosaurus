import { PrismaClient } from "@prisma/client";

import { STATUS } from "@repo/api";
import { HASH_TYPES } from "@repo/hashcat/data";
import { verifyNtlmForNetntlmv1 } from "@repo/hashcat/ntlmv1";
import { NTLM_HASH_TYPE } from "@repo/hashcat/shuck";

// The rainbow set cracks the NetNTLMv1 challenge-response capture (hashcat mode
// 5500: user::domain:lm:nt:challenge). Mode 27000 ("NetNTLMv1 (NT)") is the
// NT-candidate/DES pipeline form, not a parseable capture string, so it is
// deliberately excluded — verifyNtlmForNetntlmv1 / parseNtlmv1 expect the
// 6-field 5500 form.
export const NETNTLMV1 = HASH_TYPES.netntlmv1; // 5500

export interface ResolveNetntlmv1Result {
  /** Whether the recovered NT hash cryptographically reproduced the capture. */
  verified: boolean;
  /** Rows flipped to FOUND across all projects (0 on replay or !verified). */
  updated: number;
  /** The normalized (lowercased) NT hash. */
  ntHash: string;
}

/**
 * Ingest a rainbow-recovered NT hash for a NetNTLMv1 (5500) capture.
 *
 * Shared by two callers with different failure semantics:
 *  - `rainbowRouter.resolve` (external machine runner) — throws BAD_REQUEST on
 *    a failed verify (a valid Bearer alone must NOT mark a capture FOUND with an
 *    arbitrary NT hash).
 *  - the in-cluster sync (`clusterPlugin`, worker-produced rainbow-results.json)
 *    — treats `verified: false` as a skip (never throws mid-sync).
 *
 * Steps (both callers):
 *  1. Cryptographically verify the NT hash reproduces the capture's NT response
 *     (anti-poison). On failure, return { verified: false } WITHOUT writing.
 *  2. Mark every still-unresolved matching capture FOUND across all projects
 *     (value = NT hash, source = "RAINBOW"). A single updateMany is atomic on
 *     its own — no wrapping transaction. Idempotent: a replay matches 0 rows.
 *  3. Fork the NT hash into the global KnownHash corpus (mode 1000, plaintext
 *     "") so it becomes a pass-the-hash / shuck candidate. Best-effort and
 *     deliberately NOT transactional with (2): Prisma emits a non-atomic
 *     read-then-insert for an `update: {}` upsert; inside an interactive
 *     transaction a unique-violation race would abort the WHOLE transaction
 *     (the JS catch cannot resume it) and silently roll back the FOUND write.
 *     Standalone, a lost race skips only this denormalized cache row — which
 *     submit-time learning and crack auto-learn also backfill.
 */
export async function resolveNetntlmv1(
  prisma: PrismaClient,
  captureHash: string,
  ntHashRaw: string
): Promise<ResolveNetntlmv1Result> {
  const ntHash = ntHashRaw.toLowerCase();

  if (!verifyNtlmForNetntlmv1(captureHash, ntHash))
    return { verified: false, updated: 0, ntHash };

  const { count } = await prisma.hash.updateMany({
    where: {
      hash: captureHash,
      hashType: NETNTLMV1,
      status: { not: STATUS.Found },
    },
    data: {
      status: STATUS.Found,
      value: ntHash,
      source: "RAINBOW",
      updatedAt: new Date(),
    },
  });

  try {
    await prisma.knownHash.upsert({
      where: { hash_hashType: { hash: ntHash, hashType: NTLM_HASH_TYPE } },
      update: {},
      create: { hash: ntHash, hashType: NTLM_HASH_TYPE, plaintext: "" },
    });
  } catch {
    // Ignore unique-constraint race — a concurrent submit/crack may have
    // inserted the same NT hash.
  }

  return { verified: true, updated: count, ntHash };
}
