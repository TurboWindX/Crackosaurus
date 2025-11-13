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
      const ruleIDs = data.flatMap((job) => job.ruleID).filter((id): id is string => id !== undefined);

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
            members: hasPermission("root")
              ? undefined
              : { some: { ID: currentUserID } },
          },
        });

        const projectMap = Object.fromEntries(
          projects.map((p: any) => [p.PID, p])
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
          jobData.map(([{ wordlistID, ruleID }, hashes, JID]) =>
            tx.job.create({
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
            })
          )
        );

        return jobData.map(([, , JID]) => JID);
      });
    }),

  // Approve single job and mark as approved. Scheduling to cluster is out of scope here.
  approve: permissionProcedure(["jobs:approve"])
    .input(z.object({ jobID: z.string() }))
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID } = opts.input;
      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        const job = await tx.job.findUniqueOrThrow({
          where: { JID: jobID },
          select: {
            JID: true,
            wordlistId: true,
            ruleId: true,
            instanceType: true,
            approvalStatus: true,
            hashes: {
              select: {
                HID: true,
                hash: true,
                hashType: true,
              },
            },
          },
        });
        if (job.approvalStatus !== "PENDING")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job not pending",
          });

        if (!job.instanceType)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job missing instance type",
          });

        // Create a fresh instance for this approved job. We intentionally do
        // NOT reuse pre-warmed instances: policy is one job == one EC2 GPU
        // instance, created at approval time to avoid idle-costs and surprise
        // launches on redeploy.
        const tag = await cluster.instance.create.mutate({
          instanceType: job.instanceType,
        });
        if (!tag) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const instance = await tx.instance.create({
          data: {
            name: `Auto-created for job ${jobID.slice(0, 8)}`,
            tag,
            type: job.instanceType,
            status: "RUNNING", // optimistic: cluster will start it
          },
        });

        // Update job with instance assignment and approval
        await tx.job.update({
          where: { JID: jobID },
          data: {
            approvalStatus: "APPROVED",
            instanceId: instance.IID,
            updatedAt: new Date(),
          },
        });

        // Send job to cluster. Verify the cluster knows about this instance tag
        const hashStrings = job.hashes.map((h: { hash: string }) => h.hash);
        try {
          // Wait briefly for the cluster to report the new instance tag so
          // createJobWithID doesn't race with instance startup and EFS visibility.
          const waitForVisibility = async (
            tagToCheck: string,
            attempts = 20,
            delayMs = 500
          ) => {
            for (let i = 0; i < attempts; i++) {
              try {
                const s = await cluster.info.status.query();
                if (s && tagToCheck in s.instances) return true;
              } catch {
                // ignore transient errors and retry
              }
              await new Promise((r) => setTimeout(r, delayMs));
            }
            return false;
          };

          const visible = await waitForVisibility(instance.tag);
          if (!visible) {
            // Target instance not found in cluster after waiting. Create a fresh
            // cluster instance and update DB to point to the new tag.
            if (!job.instanceType)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Job missing instance type",
              });

            const newTag = await cluster.instance.create.mutate({
              instanceType: job.instanceType,
            });
            if (!newTag)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to create cluster instance",
              });

            await tx.instance.update({
              where: { IID: instance.IID },
              data: { tag: newTag, updatedAt: new Date() },
            });

            instance.tag = newTag;
          }

          await cluster.instance.createJobWithID.mutate({
            instanceID: instance.tag, // Use tag for cluster communication
            jobID,
            wordlistID: job.wordlistId,
            hashType: job.hashes[0]?.hashType || 0, // All hashes should have same type
            hashes: hashStrings,
            ruleID: job.ruleId ?? undefined,
          });
        } catch (e) {
          console.error(
            `[JobRouter] Failed to send job ${jobID} to cluster for instance ${instance.tag}:`,
            e
          );
          throw e;
        }

        return true;
      });
    }),

  approveMany: permissionProcedure(["jobs:approve"])
    .input(z.object({ jobIDs: z.array(z.string()) }))
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { jobIDs } = opts.input;
      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        // Get all jobs to be approved
        const jobs = await tx.job.findMany({
          where: { JID: { in: jobIDs }, approvalStatus: "PENDING" },
          select: {
            JID: true,
            wordlistId: true,
            ruleId: true,
            instanceType: true,
            approvalStatus: true,
            hashes: {
              select: {
                HID: true,
                hash: true,
                hashType: true,
              },
            },
          },
        });

        if (jobs.length === 0) return 0;

        // Group jobs by instance type for efficient instance assignment
        const jobsByType = jobs.reduce(
          (acc: Record<string, typeof jobs>, job: (typeof jobs)[0]) => {
            const type = job.instanceType;
            if (!type) return acc; // Skip jobs without instance type
            if (!acc[type]) acc[type] = [];
            acc[type].push(job);
            return acc;
          },
          {} as Record<string, typeof jobs>
        );

        let totalApproved = 0;

        for (const [, typeJobs] of Object.entries(jobsByType) as [
          string,
          typeof jobs,
        ][]) {
          for (const job of typeJobs) {
            if (!job.instanceType) continue; // Skip jobs without instance type

            // Create a fresh instance for each job (one job == one instance)
            const tag = await cluster.instance.create.mutate({
              instanceType: job.instanceType,
            });
            if (!tag) continue; // Skip if instance creation failed

            const instance = await tx.instance.create({
              data: {
                name: `Auto-created for job ${job.JID.slice(0, 8)}`,
                tag,
                type: job.instanceType,
                status: "RUNNING",
              },
            });

            await tx.job.update({
              where: { JID: job.JID },
              data: {
                approvalStatus: "APPROVED",
                instanceId: instance.IID,
                updatedAt: new Date(),
              },
            });

            const hashStrings = job.hashes.map((h: { hash: string }) => h.hash);
            try {
              // Wait briefly for the cluster to report the new instance tag
              const waitForVisibility = async (
                tagToCheck: string,
                attempts = 20,
                delayMs = 500
              ) => {
                for (let i = 0; i < attempts; i++) {
                  try {
                    const s = await cluster.info.status.query();
                    if (s && tagToCheck in s.instances) return true;
                  } catch {
                    // ignore transient errors and retry
                  }
                  await new Promise((r) => setTimeout(r, delayMs));
                }
                return false;
              };

              const visible = await waitForVisibility(instance.tag);
              if (!visible) {
                // If not visible, attempt to recreate a fresh instance tag and update DB.
                if (!job.instanceType) {
                  throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Job missing instance type",
                  });
                }

                const newTag = await cluster.instance.create.mutate({
                  instanceType: job.instanceType,
                });
                if (!newTag)
                  throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create cluster instance",
                  });

                await tx.instance.update({
                  where: { IID: instance.IID },
                  data: { tag: newTag, updatedAt: new Date() },
                });

                instance.tag = newTag;
              }

              await cluster.instance.createJobWithID.mutate({
                instanceID: instance.tag,
                jobID: job.JID,
                wordlistID: job.wordlistId,
                hashType: job.hashes[0]?.hashType || 0,
                hashes: hashStrings,
                ruleID: job.ruleId ?? undefined,
              });
            } catch (e) {
              console.error(
                `[JobRouter] Failed to send job ${job.JID} to cluster for instance ${tag}:`,
                e
              );
            }

            totalApproved++;
          }
        }

        return totalApproved;
      });
    }),
});

export type JobRouter = typeof jobRouter;


