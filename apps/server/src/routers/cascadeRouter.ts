import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";

const cascadeStepSchema = z.object({
  order: z.number().int().min(0),
  attackMode: z.number().int().min(0).default(0),
  wordlistId: z.string().optional(),
  ruleId: z.string().optional(),
  mask: z.string().optional(),
  instanceType: z.string().optional(),
});

const cascadeOutputSchema = z.object({
  CID: z.string(),
  name: z.string(),
  steps: z.array(
    z.object({
      CSID: z.string(),
      order: z.number(),
      attackMode: z.number(),
      wordlistId: z.string().nullable(),
      ruleId: z.string().nullable(),
      mask: z.string().nullable(),
      instanceType: z.string().nullable(),
      wordlist: z
        .object({ WID: z.string(), name: z.string().nullable() })
        .nullable()
        .optional(),
      rule: z
        .object({ RID: z.string(), name: z.string().nullable() })
        .nullable()
        .optional(),
    })
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const cascadeRouter = t.router({
  /** Create a new cascade template with steps */
  create: permissionProcedure(["instances:jobs:add"])
    .input(
      z.object({
        name: z.string().min(1).max(255),
        steps: z.array(cascadeStepSchema).min(1),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { name, steps } = opts.input;
      const { prisma } = opts.ctx;

      // Validate that orders are sequential from 0
      const sorted = [...steps].sort((a, b) => a.order - b.order);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i]!.order !== i) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Step orders must be sequential starting from 0. Expected ${i}, got ${sorted[i]!.order}`,
          });
        }
      }

      // Validate each step: dictionary attacks need a wordlist, mask attacks need a mask
      for (const step of sorted) {
        if ((step.attackMode ?? 0) === 0 && !step.wordlistId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Step ${step.order}: dictionary attack requires a wordlistId`,
          });
        }
        if (step.attackMode === 3 && !step.mask) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Step ${step.order}: mask attack requires a mask`,
          });
        }
      }

      const cascade = await prisma.cascade.create({
        data: {
          name,
          steps: {
            create: sorted.map((s) => ({
              order: s.order,
              attackMode: s.attackMode ?? 0,
              wordlistId: s.wordlistId ?? null,
              ruleId: s.ruleId ?? null,
              mask: s.mask ?? null,
              instanceType: s.instanceType ?? null,
            })),
          },
        },
        select: { CID: true },
      });

      return cascade.CID;
    }),

  /** Get a single cascade by ID */
  get: permissionProcedure(["instances:jobs:add"])
    .input(z.object({ cascadeID: z.string() }))
    .output(cascadeOutputSchema)
    .query(async (opts) => {
      const { cascadeID } = opts.input;
      const { prisma } = opts.ctx;

      const cascade = await prisma.cascade.findUnique({
        where: { CID: cascadeID },
        select: {
          CID: true,
          name: true,
          steps: {
            select: {
              CSID: true,
              order: true,
              attackMode: true,
              wordlistId: true,
              ruleId: true,
              mask: true,
              instanceType: true,
              wordlist: { select: { WID: true, name: true } },
              rule: { select: { RID: true, name: true } },
            },
            orderBy: { order: "asc" },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!cascade) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cascade not found",
        });
      }

      return cascade;
    }),

  /** List all cascades */
  getMany: permissionProcedure(["instances:jobs:add"])
    .output(
      z.array(
        z.object({
          CID: z.string(),
          name: z.string(),
          stepCount: z.number(),
          createdAt: z.date(),
          updatedAt: z.date(),
        })
      )
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      const cascades = await prisma.cascade.findMany({
        select: {
          CID: true,
          name: true,
          _count: { select: { steps: true } },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      return cascades.map(
        (c: {
          CID: string;
          name: string;
          _count: { steps: number };
          createdAt: Date;
          updatedAt: Date;
        }) => ({
          CID: c.CID,
          name: c.name,
          stepCount: c._count.steps,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })
      );
    }),

  /** Delete a cascade template */
  delete: permissionProcedure(["instances:jobs:add"])
    .input(z.object({ cascadeID: z.string() }))
    .output(z.boolean())
    .mutation(async (opts) => {
      const { cascadeID } = opts.input;
      const { prisma } = opts.ctx;

      // Delete steps first (cascade delete), then the cascade
      await prisma.cascadeStep.deleteMany({
        where: { cascadeId: cascadeID },
      });
      await prisma.cascade.delete({
        where: { CID: cascadeID },
      });

      return true;
    }),

  /** Update a cascade's steps (replace all) */
  update: permissionProcedure(["instances:jobs:add"])
    .input(
      z.object({
        cascadeID: z.string(),
        name: z.string().min(1).max(255).optional(),
        steps: z.array(cascadeStepSchema).min(1).optional(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { cascadeID, name, steps } = opts.input;
      const { prisma } = opts.ctx;

      const existing = await prisma.cascade.findUnique({
        where: { CID: cascadeID },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cascade not found",
        });
      }

      if (name) {
        await prisma.cascade.update({
          where: { CID: cascadeID },
          data: { name },
        });
      }

      if (steps) {
        const sorted = [...steps].sort((a, b) => a.order - b.order);
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i]!.order !== i) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Step orders must be sequential starting from 0`,
            });
          }
        }

        // Replace all steps
        await prisma.cascadeStep.deleteMany({
          where: { cascadeId: cascadeID },
        });
        await prisma.cascadeStep.createMany({
          data: sorted.map((s) => ({
            cascadeId: cascadeID,
            order: s.order,
            attackMode: s.attackMode ?? 0,
            wordlistId: s.wordlistId ?? null,
            ruleId: s.ruleId ?? null,
            mask: s.mask ?? null,
            instanceType: s.instanceType ?? null,
          })),
        });
      }

      return true;
    }),
});

export type CascadeRouter = typeof cascadeRouter;
