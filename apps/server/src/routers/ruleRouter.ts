import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export const ruleRouter = t.router({
  get: permissionProcedure(["rules:get"])
    .input(z.object({ ruleID: z.string() }))
    .output(
      z.object({
        RID: z.string(),
        name: z.string().nullable(),
        size: z.number().int().min(0),
        checksum: z.string(),
        updatedAt: z.date(),
      })
    )
    .query(async (opts) => {
      const { ruleID } = opts.input;
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const row = await tx.rule.findUniqueOrThrow({
          select: {
            RID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
          where: { RID: ruleID },
        });

        return { ...row, size: Number(row.size as unknown as bigint) };
      });
    }),

  getMany: permissionProcedure(["rules:get"])
    .output(
      z.array(
        z.object({
          RID: z.string(),
          name: z.string().nullable(),
          size: z.number().int().min(0),
          checksum: z.string(),
          updatedAt: z.date(),
        })
      )
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const rows = await tx.rule.findMany({
          select: {
            RID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
        });
        return rows.map(
          (row: {
            RID: string;
            name: string | null;
            size: bigint;
            checksum: string;
            createdAt: Date;
            updatedAt: Date;
          }) => ({
            ...row,
            size: Number(row.size),
          })
        );
      });
    }),

  getList: permissionProcedure(["rules:get"])
    .output(z.array(z.object({ RID: z.string(), name: z.string().nullable() })))
    .query(async (opts) => {
      const { prisma } = opts.ctx;
      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        return tx.rule.findMany({ select: { RID: true, name: true } });
      });
    }),

  deleteMany: permissionProcedure(["rules:remove"])
    .input(z.object({ ruleIDs: z.array(z.string()) }))
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { ruleIDs } = opts.input;
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const { count } = await tx.rule.deleteMany({
          where: { RID: { in: ruleIDs } },
        });
        return count;
      });
    }),
});

export type RuleRouter = typeof ruleRouter;
