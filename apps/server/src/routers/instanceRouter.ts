import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod";

import { STATUS } from "@repo/api";

import { permissionProcedure, t } from "../plugins/trpc";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

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

      return await prisma.$transaction(async (tx: TransactionClient) => {
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

      return await prisma.$transaction(async (tx: TransactionClient) => {
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

      return await prisma.$transaction(async (tx: TransactionClient) => {
        return await tx.instance.findMany({
          select: {
            IID: true,
            name: true,
          },
        });
      });
    }),
  debugListAll: permissionProcedure(["instances:list"])
    .output(
      z
        .object({
          IID: z.string(),
          name: z.string().nullable(),
          tag: z.string(),
          type: z.string().nullable(),
          status: z.string(),
          createdAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        return await tx.instance.findMany({
          select: {
            IID: true,
            name: true,
            tag: true,
            type: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        });
      });
    }),
  getTypes: permissionProcedure(["instances:get"])
    .output(z.string().array())
    .query(async (opts) => {
      const { cluster } = opts.ctx;

      return await cluster.info.type.query();
    }),
  getAvailability: permissionProcedure(["instances:get"])
    .output(
      z.record(
        z.string(),
        z.object({
          available: z.boolean(),
          azs: z.string().array(),
        })
      )
    )
    .query(async (opts) => {
      const { cluster } = opts.ctx;

      // Wrap with a timeout so a slow/unreachable cluster doesn't cause a
      // 504 on batched tRPC requests (ALB timeout is typically 60 s).
      const AVAILABILITY_TIMEOUT_MS = 15_000;
      try {
        const result = await Promise.race([
          cluster.info.availability.query(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("getAvailability timed out")),
              AVAILABILITY_TIMEOUT_MS
            )
          ),
        ]);
        return result;
      } catch (e) {
        console.warn(
          "[instanceRouter] getAvailability failed, returning empty:",
          e
        );
        return {};
      }
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

      return await prisma.$transaction(async (tx: TransactionClient) => {
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

      // 1) Fetch instances first (outside a transaction) so we can call the
      // cluster RPC without holding an open DB transaction.
      const instances = await prisma.instance.findMany({
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

      if (instances.length === 0) return 0;

      // 2) Ask the cluster to delete instance folders. The cluster returns an
      // array of booleans aligned with the input order (true = deleted).
      let deleteResults: (boolean | null)[] = [];
      try {
        deleteResults = await cluster.instance.deleteMany.mutate({
          instanceIDs: instances.map(
            (instance: { tag: string }) => instance.tag
          ),
        });
      } catch (e) {
        // If the cluster RPC fails, it's safer to abort and surface an error
        // rather than deleting DB rows while cluster cleanup failed.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete instance folders: ${String(e)}`,
        });
      }

      // 3) Determine which instances were successfully deleted by the cluster
      const deletedIIDs = instances
        .map((inst: { IID: string }, idx: number) => ({
          iid: inst.IID,
          ok: Boolean(deleteResults[idx]),
        }))
        .filter((x: { iid: string; ok: boolean }) => x.ok)
        .map((x: { iid: string; ok: boolean }) => x.iid);

      if (deletedIIDs.length === 0) {
        // Nothing deleted on the cluster side, nothing to remove from DB.
        return 0;
      }

      // 4) Delete jobs and instance rows in a short transaction.
      return await prisma.$transaction(async (tx: TransactionClient) => {
        await tx.job.deleteMany({
          where: {
            instance: {
              IID: {
                in: deletedIIDs,
              },
            },
          },
        });

        const { count } = await tx.instance.deleteMany({
          where: {
            IID: {
              in: deletedIIDs,
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

      return await prisma.$transaction(async (tx: TransactionClient) => {
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
            members: hasPermission("projects:get")
              ? undefined
              : {
                  some: {
                    ID: currentUserID,
                  },
                },
          },
        });
        const projectMap = Object.fromEntries(
          projects.map(
            (project: {
              PID: string;
              hashes: {
                HID: string;
                hash: string;
                hashType: number;
                status: string;
              }[];
            }) => [project.PID, project]
          )
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

      // 1) Fetch instance and jobs outside the transaction
      const instance = await prisma.instance.findUniqueOrThrow({
        select: {
          IID: true,
          tag: true,
        },
        where: {
          IID: instanceID,
        },
      });

      const jobs = await prisma.job.findMany({
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

      if (jobs.length === 0) return 0;

      // 2) Call cluster RPC to delete job folders (can be slow — must be
      //    outside the DB transaction to avoid the 5 s timeout)
      const results = await cluster.instance.deleteJobs.mutate({
        instanceID: instance.tag,
        jobIDs: jobs.map((job: { JID: string }) => job.JID),
      });

      const deletedIDs = jobs
        .filter((_: unknown, index: number) => results[index])
        .map(({ JID }: { JID: string }) => JID);

      if (deletedIDs.length === 0) return 0;

      // 3) Delete DB rows in a short transaction
      return await prisma.$transaction(async (tx: TransactionClient) => {
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
