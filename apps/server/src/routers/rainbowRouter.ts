import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { STATUS } from "@repo/api";

import { NETNTLMV1, resolveNetntlmv1 } from "../lib/rainbow";
import { serviceProcedure, t } from "../plugins/trpc";

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

      // Shared with the in-cluster sync (clusterPlugin). Here a failed verify is
      // a hard client error — a valid Bearer alone must NOT mark a capture FOUND
      // with an arbitrary/garbage NT hash.
      const { verified, updated, ntHash } = await resolveNetntlmv1(
        prisma,
        hash,
        opts.input.ntHash
      );

      if (!verified)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Recovered NT hash does not match the NetNTLMv1 capture.",
        });

      return { updated, ntHash };
    }),
});

export type RainbowRouter = typeof rainbowRouter;
