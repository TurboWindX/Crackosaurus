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

      return await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: {
            PID: projectID,
            members: hasPermission("root")
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

        const seenHashMap = Object.fromEntries(
          seenHashes.map((hash) => [hash.hash, hash.value ?? ""])
        );

        const outHashes = await tx.hash.createManyAndReturn({
          select: {
            HID: true,
            hash: true,
          },
          data: data.map((hash) => {
            const hashValue = hashValueMap[hash.hash]!;
            const seenHash = seenHashMap[hashValue];

            return {
              hash: hashValue,
              hashType: hash.hashType,
              value: seenHash,
              status: seenHash ? STATUS.Found : undefined,
              projectId: projectID,
            };
          }),
        });

        const outHashMap = Object.fromEntries(
          outHashes.map((hash) => [hash.hash, hash.HID])
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

      return await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: {
            PID: projectID,
            members: hasPermission("root")
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
