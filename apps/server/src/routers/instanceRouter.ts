import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod";

import { STATUS } from "@repo/api";

import { permissionProcedure, t } from "../plugins/trpc";

export const instanceRouter = t.router({
  get: permissionProcedure(["instances:get"])
    .input(
      z.object({
        instanceID: z.string(),
      })
    )
    .output(
      z.object({
        IID: z.string(),
        name: z.string().nullable(),
        tag: z.string(),
        status: z.string(),
        updatedAt: z.date(),
        jobs: z
          .object({
            JID: z.string(),
            status: z.string(),
            updatedAt: z.date(),
          })
          .array(),
      })
    )
    .query(async (opts) => {
      const { instanceID } = opts.input;

      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: typeof prisma) => {
        return await tx.instance.findUniqueOrThrow({
          include: {
            jobs: true,
          },
          where: {
            IID: instanceID,
          },
        });
      });
    }),
  getMany: permissionProcedure(["instances:get"])
    .output(
      z
        .object({
          IID: z.string(),
          name: z.string().nullable(),
          status: z.string(),
          updatedAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: typeof prisma) => {
        return await tx.instance.findMany({
          select: {
            IID: true,
            name: true,
            status: true,
            updatedAt: true,
          },
        });
      });
    }),
  getList: permissionProcedure(["instances:list"])
    .output(
      z
        .object({
          IID: z.string(),
          name: z.string().nullable(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: typeof prisma) => {
        return await tx.instance.findMany({
          select: {
            IID: true,
            name: true,
          },
        });
      });
    }),
  getTypes: permissionProcedure(["instances:get"])
    .output(z.string().array())
    .query(async (opts) => {
      const { cluster } = opts.ctx;

      return await cluster.info.type.query();
    }),
  create: permissionProcedure(["instances:add"])
    .input(
      z.object({
        name: z.string(),
        type: z.string(),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { name, type } = opts.input;

      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: typeof prisma) => {
        const tag = await cluster.instance.create.mutate({
          instanceType: type,
        });
        if (!tag) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const instance = await tx.instance.create({
          select: {
            IID: true,
          },
          data: {
            name,
            tag,
            type,
          },
        });

        return instance.IID;
      });
    }),
  deleteMany: permissionProcedure(["instances:add"])
    .input(
      z.object({
        instanceIDs: z.string().array(),
      })
    )
    .output(z.number().min(0))
    .mutation(async (opts) => {
      const { instanceIDs } = opts.input;

      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: typeof prisma) => {
        const instances = await tx.instance.findMany({
          select: {
            IID: true,
            tag: true,
          },
          where: {
            IID: {
              in: instanceIDs,
            },
          },
        });

        await cluster.instance.deleteMany.mutate({
          instanceIDs: instances.map(
            (instance: { tag: string }) => instance.tag
          ),
        });

        const deletedIDs = instances.map(
          (instance: { IID: string }) => instance.IID
        );

        await tx.job.deleteMany({
          where: {
            instance: {
              IID: {
                in: deletedIDs,
              },
            },
          },
        });

        const { count } = await tx.instance.deleteMany({
          where: {
            IID: {
              in: deletedIDs,
            },
          },
        });

        return count;
      });
    }),
  createJobs: permissionProcedure(["instances:jobs:add"])
    .input(
      z.object({
        instanceID: z.string(),
        data: z
          .object({
            wordlistID: z.string(),
            hashType: z.number().int().min(0),
            projectIDs: z.string().array(),
            ruleID: z.string().optional(),
          })
          .array(),
      })
    )
    .output(z.string().array())
    .mutation(async (opts) => {
      const { instanceID, data } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      const projectIDs = data.flatMap((job) => job.projectIDs);
      const wordlistIDs = data.map((job) => job.wordlistID);
      const ruleIDs = data.map((job) => job.ruleID).filter(Boolean) as string[];

      return await prisma.$transaction(async (tx: typeof prisma) => {
        await tx.instance.findUniqueOrThrow({
          where: {
            IID: instanceID,
          },
        });

        const projects = await tx.project.findMany({
          select: {
            PID: true,
            hashes: {
              select: {
                HID: true,
                hash: true,
                hashType: true,
                status: true,
              },
            },
          },
          where: {
            PID: {
              in: projectIDs,
            },
            members: hasPermission("root")
              ? undefined
              : {
                  some: {
                    ID: currentUserID,
                  },
                },
          },
        });
        const projectMap = Object.fromEntries(
          projects.map((project: { PID: string }) => [project.PID, project])
        );

        const wordlists = await tx.wordlist.findMany({
          select: {
            WID: true,
          },
          where: {
            WID: {
              in: wordlistIDs,
            },
          },
        });
        const ruleIDSet = new Set<string>();
        if (ruleIDs.length > 0) {
          const rules = await tx.rule.findMany({
            select: { RID: true },
            where: { RID: { in: ruleIDs } },
          });
          rules.forEach((r: { RID: string }) => ruleIDSet.add(r.RID));
        }
        const wordlistIDSet = new Set(
          wordlists.map((wordlist: { WID: string }) => wordlist.WID)
        );

        // Prepare job data without sending to cluster yet (will be sent on approval)
        const result = await Promise.allSettled(
          data.map(async (job) => {
            if (!wordlistIDSet.has(job.wordlistID)) return null;

            const jobProjects = job.projectIDs
              .map((projectID) => projectMap[projectID]!)
              .filter((project) => project);

            const jobHashes = jobProjects.flatMap((project) =>
              project.hashes.filter(
                (hash: { hashType: number; status: string }) =>
                  hash.hashType === job.hashType &&
                  hash.status === STATUS.NotFound
              )
            );

            if (jobHashes.length === 0) return null;

            // Generate job ID locally - don't send to cluster until approved
            const JID = crypto.randomUUID();

            return [job, jobHashes, JID] as const;
          })
        );

        const jobData = result
          .filter(
            (res) => res.status === "fulfilled" && res.value && res.value[2]
          )
          .map(
            (res) =>
              (
                res as unknown as Record<
                  string,
                  [(typeof data)[number], { HID: string }[], string]
                >
              ).value
          ) as [(typeof data)[number], { HID: string }[], string][];

        await Promise.all(
          jobData.map(([{ wordlistID, ruleID }, hashes, JID]) =>
            tx.job.create({
              data: {
                JID,
                wordlistId: wordlistID,
                ruleId: ruleID && ruleIDSet.has(ruleID) ? ruleID : undefined,
                instanceId: instanceID,
                hashes: {
                  connect: hashes.map(({ HID }) => ({ HID })),
                },
                approvalStatus: "PENDING", // Jobs start as pending approval
                submittedById: currentUserID,
              },
            })
          )
        );

        return jobData.map(([, , JID]) => JID);
      });
    }),
  deleteJobs: permissionProcedure(["instances:jobs:remove"])
    .input(
      z.object({
        instanceID: z.string(),
        jobIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { instanceID, jobIDs } = opts.input;

      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: typeof prisma) => {
        const instance = await tx.instance.findUniqueOrThrow({
          select: {
            IID: true,
            tag: true,
          },
          where: {
            IID: instanceID,
          },
        });

        const jobs = await tx.job.findMany({
          select: {
            JID: true,
          },
          where: {
            JID: {
              in: jobIDs,
            },
            instance: {
              IID: instanceID,
            },
          },
        });

        const results = await cluster.instance.deleteJobs.mutate({
          instanceID: instance.tag,
          jobIDs: jobs.map((job: { JID: string }) => job.JID),
        });

        const deletedIDs = jobs
          .filter((_: unknown, index: number) => results[index])
          .map(({ JID }: { JID: string }) => JID);

        const { count } = await tx.job.deleteMany({
          where: {
            JID: {
              in: deletedIDs,
            },
          },
        });

        await tx.instance.update({
          where: {
            IID: instanceID,
          },
          data: {
            updatedAt: new Date(),
          },
        });

        return count;
      });
    }),
});

export type InstanceRouter = typeof instanceRouter;
