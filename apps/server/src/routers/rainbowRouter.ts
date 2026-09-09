import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { STATUS } from "@repo/api";
import { HASH_TYPES } from "@repo/hashcat/data";
import { verifyNtlmForNetntlmv1 } from "@repo/hashcat/ntlmv1";
import { NTLM_HASH_TYPE } from "@repo/hashcat/shuck";

import { serviceProcedure, t } from "../plugins/trpc";

// The rainbow set cracks the NetNTLMv1 challenge-response capture (hashcat mode
// 5500: user::domain:lm:nt:challenge). Mode 27000 ("NetNTLMv1 (NT)") is the
// NT-candidate/DES pipeline form, not a parseable capture string, so it is
// deliberately excluded here — verifyNtlmForNetntlmv1 / parseNtlmv1 expect the
// 6-field 5500 form.
const NETNTLMV1 = HASH_TYPES.netntlmv1; // 5500

/**
 * Machine-only endpoints for an external NetNTLMv1 rainbow-lookup runner.
 *
 * Every procedure is a `serviceProcedure` (shared-secret Bearer, no user
 * session), so this router is a single, self-contained machine-to-machine
 * surface — nothing here consults project membership or user permissions. That
 * is intentional: the runner has no user identity and must see unresolved
 * captures across ALL projects. Access is controlled solely by the service
 * secret gate; keep every procedure in this router on serviceProcedure.
 */
export const rainbowRouter = t.router({
  // List distinct unresolved NetNTLMv1 captures across all projects so the
  // runner can pull a work batch. Distinct on (hash, hashType) dedupes the same
  // capture submitted to multiple projects — it is cracked once and resolved
  // everywhere (see `resolve`).
  listUnresolved: serviceProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(2000).default(500),
        })
        .default({})
    )
    .output(z.object({ hash: z.string(), hashType: z.number().int() }).array())
    .query(async (opts) => {
      const { limit } = opts.input;
      const { prisma } = opts.ctx;

      const rows = await prisma.hash.findMany({
        distinct: ["hash", "hashType"],
        where: {
          hashType: NETNTLMV1,
          status: { not: STATUS.Found },
        },
        select: { hash: true, hashType: true },
        take: limit,
      });

      return rows;
    }),

  // Record a rainbow-recovered NT hash for a NetNTLMv1 capture.
  //
  // 1. Cryptographically verify the NT hash reproduces the capture's NT
  //    response (anti-poison — a valid Bearer alone is NOT enough to mark a
  //    capture FOUND with an arbitrary/garbage NT hash).
  // 2. Mark every still-unresolved matching capture row FOUND across all
  //    projects (value = NT hash, source = "RAINBOW"). Idempotent: a replay
  //    matches 0 rows and returns updated: 0.
  // 3. Fork the NT hash into the global KnownHash corpus (mode 1000, plaintext
  //    "") so it becomes a pass-the-hash / shuck candidate and resolves future
  //    NTLM submissions as duplicates. Idempotent upsert that never clobbers an
  //    existing plaintext (a real crack may have already backfilled it).
  resolve: serviceProcedure
    .input(
      z.object({
        hash: z.string().min(1),
        ntHash: z
          .string()
          .regex(/^[0-9a-fA-F]{32}$/, "ntHash must be 32 hex chars"),
      })
    )
    .output(z.object({ updated: z.number().int().min(0), ntHash: z.string() }))
    .mutation(async (opts) => {
      const { hash } = opts.input;
      const { prisma } = opts.ctx;
      const ntHash = opts.input.ntHash.toLowerCase();

      if (!verifyNtlmForNetntlmv1(hash, ntHash))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Recovered NT hash does not match the NetNTLMv1 capture.",
        });

      // Authoritative write — a single updateMany is atomic on its own, so it
      // needs no wrapping transaction. Marks every still-unresolved matching
      // capture FOUND across all projects. Idempotent: a replay matches 0 rows.
      const { count } = await prisma.hash.updateMany({
        where: {
          hash,
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

      // Best-effort corpus fork, deliberately NOT in a transaction with the
      // update above. Prisma emits a non-atomic read-then-insert for an
      // `update: {}` upsert; inside an interactive transaction a unique-violation
      // race would abort the WHOLE transaction (the JS catch cannot resume it),
      // silently rolling back the FOUND write. Standalone, a lost race skips only
      // this denormalized cache row — which submit-time learning and crack
      // auto-learn also backfill — and never touches the authoritative FOUND
      // update. `update: {}` preserves any existing plaintext.
      try {
        await prisma.knownHash.upsert({
          where: {
            hash_hashType: { hash: ntHash, hashType: NTLM_HASH_TYPE },
          },
          update: {},
          create: { hash: ntHash, hashType: NTLM_HASH_TYPE, plaintext: "" },
        });
      } catch {
        // Ignore unique-constraint race — a concurrent submit/crack may have
        // inserted the same NT hash.
      }

      return { updated: count, ntHash };
    }),
});

export type RainbowRouter = typeof rainbowRouter;
