import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { STATUS } from "@repo/api";
import { toHashcatHash } from "@repo/hashcat/data";

import { permissionProcedure, t } from "../plugins/trpc";

export const hashRouter = t.router({
  createMany: permissionProcedure(["hashes:add"])
    .input(
      z.object({
        projectID: z.string(),
        data: z
          .object({
            hash: z.string(),
            hashType: z.number().int().min(0),
          })
          .array(),
      })
    )
    .output(z.string().nullable().array())
    .mutation(async (opts) => {
      const { projectID, data } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.project.update({
          where: {
            PID: projectID,
            members: hasPermission("projects:get")
              ? undefined
              : {
                  some: {
                    ID: currentUserID,
                  },
                },
          },
          data: {
            updatedAt: new Date(),
          },
        });

        const hashValueMap = Object.fromEntries(
          data.map((hash) => [
            hash.hash,
            toHashcatHash(hash.hashType, hash.hash),
          ])
        );

        // Check existing Hash records for previously found values (duplicate across projects)
        const seenHashes = await tx.hash.findMany({
          select: {
            hash: true,
            value: true,
          },
          where: {
            hash: {
              in: Object.values(hashValueMap),
            },
            status: "FOUND",
          },
        });

        // Track value + source separately so we can distinguish duplicates from shucked
        const resolvedMap: Record<string, { value: string; source: string }> =
          {};

        for (const hash of seenHashes) {
          resolvedMap[hash.hash] = {
            value: hash.value ?? "",
            source: "DUPLICATE",
          };
        }

        // Also check KnownHash table (auto-learned from previous cracks)
        const knownHashes = await tx.knownHash.findMany({
          where: {
            OR: data.map((hash) => ({
              hash: toHashcatHash(hash.hashType, hash.hash),
              hashType: hash.hashType,
            })),
          },
          select: { hash: true, hashType: true, plaintext: true },
        });

        for (const known of knownHashes) {
          if (!resolvedMap[known.hash]) {
            resolvedMap[known.hash] = {
              value: known.plaintext,
              source: "KNOWN",
            };
          }
        }

        const outHashes = await tx.hash.createManyAndReturn({
          select: {
            HID: true,
            hash: true,
          },
          data: data.map((hash) => {
            const hashValue = hashValueMap[hash.hash]!;
            const resolved = resolvedMap[hashValue];

            return {
              hash: hashValue,
              hashType: hash.hashType,
              value: resolved?.value,
              status: resolved ? STATUS.Found : undefined,
              source: resolved?.source,
              projectId: projectID,
            };
          }),
        });

        const outHashMap = Object.fromEntries(
          outHashes.map((hash: { hash: string; HID: string }) => [
            hash.hash,
            hash.HID,
          ])
        );

        return data.map((hash) => outHashMap[hashValueMap[hash.hash]!] ?? null);
      });
    }),
  deleteMany: permissionProcedure(["hashes:remove"])
    .input(
      z.object({
        projectID: z.string(),
        hashIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { projectID, hashIDs } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.project.update({
          where: {
            PID: projectID,
            members: hasPermission("projects:get")
              ? undefined
              : {
                  some: {
                    ID: currentUserID,
                  },
                },
          },
          data: {
            updatedAt: new Date(),
          },
        });

        const { count } = await tx.hash.deleteMany({
          where: {
            HID: {
              in: hashIDs,
            },
            projectId: projectID,
          },
        });

        return count;
      });
    }),
});

export type HashRouter = typeof hashRouter;
