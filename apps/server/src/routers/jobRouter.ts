import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod";

import { STATUS, type JobProgress } from "@repo/api";
import { JOB_PROGRESS } from "@repo/api";

import { getJobProgressCached } from "../plugins/cluster/plugin";
import { permissionProcedure, t } from "../plugins/trpc";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export const jobRouter = t.router({
  // Create pending job requests (called from project UI)
  requestJobs: permissionProcedure(["instances:jobs:add"])
    .input(
      z.object({
        instanceType: z.string(),
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
    .output(z.array(z.string()))
    .mutation(async (opts) => {
      const { instanceType, data } = opts.input;
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      const projectIDs = data.flatMap((job) => job.projectIDs);
      const wordlistIDs = data.map((job) => job.wordlistID);
      const ruleIDs = data
        .flatMap((job) => job.ruleID)
        .filter((id): id is string => id !== undefined);

      return await prisma.$transaction(async (tx: TransactionClient) => {
        const projects = await tx.project.findMany({
          select: {
            PID: true,
            hashes: {
              select: { HID: true, hash: true, hashType: true, status: true },
            },
          },
          where: {
            PID: { in: projectIDs },
            members: hasPermission("projects:get")
              ? undefined
              : { some: { ID: currentUserID } },
          },
        });

        const projectMap = Object.fromEntries(
          projects.map(
            (p: {
              PID: string;
              hashes: {
                HID: string;
                hash: string;
                hashType: number;
                status: string;
              }[];
            }) => [p.PID, p]
          )
        );

        const wordlists = await tx.wordlist.findMany({
          select: { WID: true },
          where: { WID: { in: wordlistIDs } },
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
          wordlists.map((w: { WID: string }) => w.WID)
        );

        const result = await Promise.allSettled(
          data.map(async (job) => {
            if (!wordlistIDSet.has(job.wordlistID)) return null;

            const jobProjects = job.projectIDs
              .map((projectID) => projectMap[projectID]!)
              .filter(Boolean);

            const jobHashes = jobProjects.flatMap(
              (project: {
                hashes: { HID: string; hashType: number; status: string }[];
              }) =>
                project.hashes.filter(
                  (h: { HID: string; hashType: number; status: string }) =>
                    h.hashType === job.hashType && h.status === STATUS.NotFound
                )
            );

            if (jobHashes.length === 0) return null;

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
                res as PromiseFulfilledResult<
                  [(typeof data)[number], { HID: string }[], string] | null
                >
              ).value
          ) as [(typeof data)[number], { HID: string }[], string][];

        await Promise.all(
          jobData.map(([{ wordlistID, ruleID }, hashes, JID]) => {
            if (!instanceType) {
              throw new Error(
                `instanceType is required but was: ${instanceType}`
              );
            }
            if (!wordlistID) {
              throw new Error(`wordlistID is required but was: ${wordlistID}`);
            }
            if (!hashes || hashes.length === 0) {
              throw new Error(
                `hashes are required but got: ${hashes?.length || 0}`
              );
            }
            return tx.job.create({
              data: {
                JID,
                wordlistId: wordlistID,
                ruleId: ruleID && ruleIDSet.has(ruleID) ? ruleID : undefined,
                instanceId: null,
                hashes: { connect: hashes.map(({ HID }) => ({ HID })) },
                approvalStatus: "PENDING",
                instanceType: instanceType,
                submittedById: currentUserID,
              },
            });
          })
        );

        return jobData.map(([, , JID]) => JID);
      });
    }),

  // Create pending job requests for explicit hash IDs (used by hash table selection)
  requestJobsForHashes: permissionProcedure(["instances:jobs:add"])
    .input(
      z.object({
        instanceType: z.string(),
        wordlistID: z.string().optional(),
        ruleID: z.string().optional(),
        hashIDs: z.string().array().min(1),
        attackMode: z.number().int().min(0).default(0),
        mask: z.string().optional(),
        cascadeId: z.string().optional(),
        cascadeStepIndex: z.number().int().min(0).optional(),
      })
    )
    .output(z.array(z.string()))
    .mutation(async (opts) => {
      const {
        instanceType,
        wordlistID,
        ruleID,
        hashIDs,
        attackMode,
        mask,
        cascadeId,
        cascadeStepIndex,
      } = opts.input;
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        const isMaskAttack = attackMode === 3;

        // Validate wordlist for dictionary attacks
        let resolvedWordlistID: string | undefined = undefined;
        if (!isMaskAttack) {
          if (!wordlistID) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Dictionary attack requires a wordlist",
            });
          }
          const wordlist = await tx.wordlist.findUnique({
            select: { WID: true },
            where: { WID: wordlistID },
          });
          if (!wordlist)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Wordlist not found",
            });
          resolvedWordlistID = wordlist.WID;
        }

        // Validate mask for mask attacks
        if (isMaskAttack && !mask) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Mask attack requires a mask pattern",
          });
        }

        let resolvedRuleID: string | undefined = undefined;
        if (ruleID) {
          const rule = await tx.rule.findUnique({
            select: { RID: true },
            where: { RID: ruleID },
          });
          if (rule) resolvedRuleID = rule.RID;
        }

        const hashes = await tx.hash.findMany({
          select: { HID: true, hashType: true, status: true },
          where: {
            HID: { in: hashIDs },
            status: STATUS.NotFound,
            project: hasPermission("projects:get")
              ? undefined
              : { members: { some: { ID: currentUserID } } },
          },
        });

        if (hashes.length === 0) return [];

        const hashesByType = new Map<number, { HID: string }[]>();
        for (const h of hashes) {
          const type = Number(h.hashType);
          const list = hashesByType.get(type) ?? [];
          list.push({ HID: h.HID });
          hashesByType.set(type, list);
        }

        const jobIDs: string[] = [];
        for (const [, typeHashes] of hashesByType) {
          const JID = crypto.randomUUID();
          await tx.job.create({
            data: {
              JID,
              wordlistId: resolvedWordlistID ?? null,
              ruleId: resolvedRuleID,
              instanceId: null,
              hashes: { connect: typeHashes.map(({ HID }) => ({ HID })) },
              approvalStatus: "PENDING",
              instanceType: instanceType,
              attackMode: attackMode,
              mask: mask ?? null,
              cascadeId: cascadeId ?? null,
              cascadeStepIndex: cascadeStepIndex ?? null,
              submittedById: currentUserID,
            },
          });
          jobIDs.push(JID);
        }

        return jobIDs;
      });
    }),

  // Cancel (delete) a pending job request. Allowed for the submitter, or users who can approve jobs.
  cancelPending: permissionProcedure(["instances:jobs:add"])
    .input(z.object({ jobID: z.string() }))
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID } = opts.input;
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      await prisma.$transaction(async (tx: TransactionClient) => {
        const job = await tx.job.findUniqueOrThrow({
          where: { JID: jobID },
          select: {
            JID: true,
            approvalStatus: true,
            submittedById: true,
          },
        });

        if (job.approvalStatus !== "PENDING") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job not pending",
          });
        }

        const canCancel =
          hasPermission("root") ||
          hasPermission("jobs:approve") ||
          (job.submittedById && job.submittedById === currentUserID);

        if (!canCancel) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not allowed to cancel this job",
          });
        }

        await tx.job.delete({ where: { JID: job.JID } });
      });

      return true;
    }),

  // Cancel an approved/running job. Marks it as Stopped and attempts to
  // stop it on the cluster. Any project member can cancel jobs belonging
  // to their projects.
  cancel: permissionProcedure(["auth"])
    .input(z.object({ jobID: z.string() }))
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID } = opts.input;
      const { prisma, hasPermission, currentUserID, cluster } = opts.ctx;

      const job = await prisma.job.findUniqueOrThrow({
        where: { JID: jobID },
        select: {
          JID: true,
          status: true,
          approvalStatus: true,
          submittedById: true,
          instanceId: true,
          instance: { select: { IID: true, tag: true } },
          hashes: {
            select: {
              HID: true,
              project: {
                select: {
                  members: { select: { ID: true } },
                },
              },
            },
            take: 1,
          },
        },
      });

      // Verify user has access: root, admin, submitter, or project member
      const isProjectMember = job.hashes.some(
        (h: { project?: { members?: { ID: string }[] } | null }) =>
          h.project?.members?.some(
            (m: { ID: string }) => m.ID === currentUserID
          )
      );
      const canCancel =
        hasPermission("root") ||
        hasPermission("jobs:approve") ||
        (job.submittedById && job.submittedById === currentUserID) ||
        isProjectMember;

      if (!canCancel) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not allowed to cancel this job",
        });
      }

      // Already in a terminal state — nothing to do
      if (
        job.status === STATUS.Complete ||
        job.status === STATUS.Stopped ||
        job.status === STATUS.Error
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Job is already in terminal state: ${job.status}`,
        });
      }

      // Mark job as Stopped in the database
      await prisma.job.update({
        where: { JID: jobID },
        data: {
          status: STATUS.Stopped,
          rejectionNote: `Cancelled by user ${currentUserID}`,
          updatedAt: new Date(),
        },
      });

      // If the job is on the cluster, stop it and terminate the instance.
      // The orchestrator creates 1:1 instance-per-job, so cancelling the
      // job means the instance has no remaining work. Deleting just the job
      // would leave the EC2 instance running until cooldown expires.
      if (job.instance?.tag) {
        try {
          // Stop the job on EFS (marks job metadata as Stopped)
          await cluster.instance.deleteJobs.mutate({
            instanceID: job.instance.tag,
            jobIDs: [jobID],
          });
        } catch (e) {
          console.error(
            `[JobRouter] Failed to cancel job ${jobID} on cluster:`,
            e
          );
        }

        try {
          // Terminate the EC2 instance (marks instance as Stopped + calls
          // EC2 terminateInstances). This kills hashcat immediately instead
          // of waiting for the cooldown timer.
          await cluster.instance.deleteMany.mutate({
            instanceIDs: [job.instance.tag],
          });
        } catch (e) {
          console.error(
            `[JobRouter] Failed to terminate instance ${job.instance.tag} for cancelled job ${jobID}:`,
            e
          );
        }

        // Also mark the instance as Stopped in the database
        if (job.instance?.IID) {
          try {
            await prisma.instance.update({
              where: { IID: job.instance.IID },
              data: { status: STATUS.Stopped, updatedAt: new Date() },
            });
          } catch (e) {
            console.error(
              `[JobRouter] Failed to update instance ${job.instance.IID} status:`,
              e
            );
          }
        }
      }

      console.log(
        `[JobRouter] Job ${jobID} cancelled by ${currentUserID}, instance ${job.instance?.tag ?? "none"} terminated`
      );

      return true;
    }),

  // Approve job - just marks as approved, orchestration happens in background worker
  approve: permissionProcedure(["jobs:approve"])
    .input(z.object({ jobID: z.string() }))
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID } = opts.input;
      const { prisma, currentUserID } = opts.ctx;

      const updated = await prisma.job.updateMany({
        where: { JID: jobID, approvalStatus: "PENDING" },
        data: {
          approvalStatus: "APPROVED",
          approvedById: currentUserID,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Job not found or already approved",
        });
      }

      console.log(
        `[JobRouter] Job ${jobID} approved by ${currentUserID} - orchestration will happen in background`
      );

      return true;
    }),

  approveMany: permissionProcedure(["jobs:approve"])
    .input(z.object({ jobIDs: z.array(z.string()) }))
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { jobIDs } = opts.input;
      const { prisma, currentUserID } = opts.ctx;

      const updated = await prisma.job.updateMany({
        where: { JID: { in: jobIDs }, approvalStatus: "PENDING" },
        data: {
          approvalStatus: "APPROVED",
          approvedById: currentUserID,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(
        `[JobRouter] Approved ${updated.count} jobs - orchestration will happen in background`
      );

      return updated.count;
    }),

  // Get a single job with full details (for the Job detail page)
  get: permissionProcedure(["auth"])
    .input(z.object({ jobID: z.string() }))
    .output(
      z.object({
        JID: z.string(),
        status: z.string(),
        approvalStatus: z.string().nullable(),
        instanceType: z.string().nullable(),
        rejectionNote: z.string().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
        submittedBy: z
          .object({ ID: z.string(), username: z.string() })
          .nullable(),
        approvedBy: z
          .object({ ID: z.string(), username: z.string() })
          .nullable(),
        approvedAt: z.date().nullable(),
        wordlist: z
          .object({ WID: z.string(), name: z.string().nullable() })
          .nullable(),
        rule: z
          .object({ RID: z.string(), name: z.string().nullable() })
          .nullable(),
        instance: z
          .object({
            IID: z.string(),
            name: z.string().nullable(),
            tag: z.string(),
            type: z.string().nullable(),
            status: z.string(),
          })
          .nullable(),
        hashes: z
          .object({
            HID: z.string(),
            hash: z.string(),
            hashType: z.number(),
            status: z.string(),
            value: z.string().nullable(),
            source: z.string().nullable(),
          })
          .array(),
        projects: z
          .object({
            PID: z.string(),
            name: z.string(),
          })
          .array(),
        attackMode: z.number(),
        mask: z.string().nullable(),
        cascade: z
          .object({
            CID: z.string(),
            name: z.string(),
            totalSteps: z.number(),
          })
          .nullable(),
        cascadeStepIndex: z.number().nullable(),
      })
    )
    .query(async (opts) => {
      const { jobID } = opts.input;
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      const job = await prisma.job.findUniqueOrThrow({
        where: { JID: jobID },
        include: {
          submittedBy: { select: { ID: true, username: true } },
          approvedBy: { select: { ID: true, username: true } },
          wordlist: { select: { WID: true, name: true } },
          rule: { select: { RID: true, name: true } },
          instance: {
            select: {
              IID: true,
              name: true,
              tag: true,
              type: true,
              status: true,
            },
          },
          cascade: {
            select: {
              CID: true,
              name: true,
              _count: { select: { steps: true } },
            },
          },
          hashes: {
            select: {
              HID: true,
              hash: true,
              hashType: true,
              status: true,
              source: true,
              value: hasPermission("hashes:view"),
              project: { select: { PID: true, name: true } },
            },
          },
        },
      });

      // Authorization: user must be submitter, approver, project member, or admin
      if (!hasPermission("instances:jobs:get")) {
        if (job.submittedById !== currentUserID) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
      }

      // Collect unique projects from hashes
      const projectMap = new Map<string, { PID: string; name: string }>();
      for (const hash of job.hashes) {
        const project = (hash as unknown as { project?: { PID: string; name: string } }).project;
        if (project) {
          projectMap.set(project.PID, project);
        }
      }

      return {
        JID: job.JID,
        status: job.status,
        approvalStatus: job.approvalStatus,
        instanceType: job.instanceType,
        rejectionNote: job.rejectionNote,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        submittedBy: job.submittedBy,
        approvedBy: job.approvedBy,
        approvedAt: job.approvedAt,
        wordlist: job.wordlist,
        rule: job.rule,
        instance: job.instance,
        hashes: job.hashes.map((h: Record<string, unknown>) => ({
          HID: h.HID as string,
          hash: h.hash as string,
          hashType: h.hashType as number,
          status: h.status as string,
          value: (h.value as string) ?? null,
          source: (h.source as string) ?? null,
        })),
        projects: Array.from(projectMap.values()),
        attackMode: job.attackMode,
        mask: job.mask ?? null,
        cascade: job.cascade
          ? {
              CID: job.cascade.CID,
              name: job.cascade.name,
              totalSteps: (job.cascade as unknown as { _count?: { steps?: number } })._count?.steps ?? 0,
            }
          : null,
        cascadeStepIndex: job.cascadeStepIndex ?? null,
      };
    }),

  // Admin endpoint to clean up orphaned jobs (jobs with no hashes)
  cleanupOrphaned: permissionProcedure(["root"])
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { prisma } = opts.ctx;

      // Find jobs with no hashes associated
      const orphanedJobs = await prisma.job.findMany({
        where: {
          hashes: { none: {} },
        },
        select: { JID: true },
      });

      if (orphanedJobs.length === 0) {
        console.log("[JobRouter] No orphaned jobs found");
        return 0;
      }

      const jobIDs = orphanedJobs.map((j: { JID: string }) => j.JID);

      // Mark them as Error
      const updated = await prisma.job.updateMany({
        where: { JID: { in: jobIDs } },
        data: {
          status: STATUS.Error,
          rejectionNote: "Orphaned job: no hashes associated",
          updatedAt: new Date(),
        },
      });

      console.log(
        `[JobRouter] Marked ${updated.count} orphaned jobs as Error (JIDs: ${jobIDs.join(", ")})`
      );

      return updated.count;
    }),

  // Get live progress (ETA, speed, %) for a single job
  progress: permissionProcedure(["auth"])
    .input(z.object({ jobID: z.string() }))
    .output(JOB_PROGRESS.nullable())
    .query((opts) => {
      return getJobProgressCached(opts.input.jobID) ?? null;
    }),

  // Get live progress for multiple jobs at once (used by project page)
  progressBulk: permissionProcedure(["auth"])
    .input(z.object({ jobIDs: z.array(z.string()) }))
    .output(z.record(z.string(), JOB_PROGRESS))
    .query((opts) => {
      const result: Record<string, JobProgress> = {};
      for (const jid of opts.input.jobIDs) {
        const p = getJobProgressCached(jid);
        if (p) result[jid] = p;
      }
      return result;
    }),
});

export type JobRouter = typeof jobRouter;
