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
            members: hasPermission("root")
              ? undefined
              : { some: { ID: currentUserID } },
          },
        });

        const projectMap = Object.fromEntries(
          projects.map((p: { PID: string }) => [p.PID, p])
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

      // First, do all database operations in a transaction
      const { instance, job } = await prisma.$transaction(
        async (tx: TransactionClient) => {
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

          // Create instance folder only (don't launch EC2 yet)
          // This allows us to create the job folder before the instance starts
          console.log(
            `[JobRouter] Creating instance folder for job ${jobID} with type ${job.instanceType}`
          );
          const tag = await cluster.instance.createFolder.mutate({
            instanceType: job.instanceType,
          });
          console.log(`[JobRouter] Created instance folder with tag: ${tag}`);
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

          return { instance, job };
        }
      );

      // After DB transaction completes, create job folder in EFS BEFORE launching EC2
      // This ensures the job exists when the instance starts polling
      const hashStrings = job.hashes.map((h: { hash: string }) => h.hash);
      try {
        console.log(
          `[JobRouter] Creating job folder for job ${jobID} in instance ${instance.tag}`
        );
        await cluster.instance.createJobWithID.mutate({
          instanceID: instance.tag, // Use tag for cluster communication
          jobID,
          wordlistID: job.wordlistId!,
          hashType: job.hashes[0]?.hashType || 0, // All hashes should have same type
          hashes: hashStrings,
          ruleID: job.ruleId ?? undefined,
        });
        console.log(
          `[JobRouter] Successfully created job folder for job ${jobID} in instance ${instance.tag}`
        );
      } catch (e) {
        console.error(
          `[JobRouter] Failed to create job folder for job ${jobID} in instance ${instance.tag}:`,
          e
        );
        console.error(`[JobRouter] Error details:`, JSON.stringify(e, null, 2));
        // Don't throw - DB changes are already committed, just log the error
        // The instance will be in "running" state but job won't be in EFS
        // Manual intervention may be needed
        return false;
      }

      // NOW launch the EC2 instance after job folder is ready
      try {
        console.log(
          `[JobRouter] Launching EC2 instance ${instance.tag} for job ${jobID}`
        );
        await cluster.instance.launch.mutate({
          instanceID: instance.tag,
        });
        console.log(
          `[JobRouter] Successfully launched EC2 instance ${instance.tag}`
        );
      } catch (e) {
        console.error(
          `[JobRouter] Failed to launch EC2 instance ${instance.tag}:`,
          e
        );
        console.error(`[JobRouter] Error details:`, JSON.stringify(e, null, 2));
        // Job folder exists but instance won't launch - manual intervention needed
        return false;
      }

      return true;
    }),

  approveMany: permissionProcedure(["jobs:approve"])
    .input(z.object({ jobIDs: z.array(z.string()) }))
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { jobIDs } = opts.input;
      const { prisma, cluster } = opts.ctx;

      // First, do all database operations in a transaction
      const jobInstancePairs = await prisma.$transaction(
        async (tx: TransactionClient) => {
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

          if (jobs.length === 0) return [];

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

          const pairs: Array<{
            job: (typeof jobs)[0];
            instance: { tag: string };
          }> = [];

          for (const [, typeJobs] of Object.entries(jobsByType) as [
            string,
            typeof jobs,
          ][]) {
            for (const job of typeJobs) {
              if (!job.instanceType) continue; // Skip jobs without instance type

              // Create instance folder only (don't launch EC2 yet)
              const tag = await cluster.instance.createFolder.mutate({
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

              pairs.push({ job, instance: { tag: instance.tag } });
            }
          }

          return pairs;
        }
      );

      // After DB transaction completes, create job folders BEFORE launching instances
      // This ensures jobs exist when instances start polling
      let totalApproved = 0;

      // Step 1: Create all job folders
      await Promise.all(
        jobInstancePairs.map(
          async (pair: { job: { JID: string; wordlistId: string | null; ruleId: string | null; hashes: { hash: string; hashType: number }[] }; instance: { tag: string } }) => {
            const { job, instance } = pair;
            const hashStrings = job.hashes.map((h: { hash: string }) => h.hash);
            try {
              console.log(
                `[JobRouter] Creating job folder for job ${job.JID} in instance ${instance.tag}`
              );
              await cluster.instance.createJobWithID.mutate({
                instanceID: instance.tag,
                jobID: job.JID,
                wordlistID: job.wordlistId!,
                hashType: job.hashes[0]?.hashType || 0,
                hashes: hashStrings,
                ruleID: job.ruleId ?? undefined,
              });
              console.log(
                `[JobRouter] Successfully created job folder for job ${job.JID} in instance ${instance.tag}`
              );
            } catch (e) {
              console.error(
                `[JobRouter] Failed to create job folder for job ${job.JID} in instance ${instance.tag}:`,
                e
              );
              console.error(
                `[JobRouter] Error details:`,
                JSON.stringify(e, null, 2)
              );
              // Mark this pair as failed so we don't launch its instance
              (pair as { failed?: boolean }).failed = true;
            }
          }
        )
      );

      // Step 2: Launch all EC2 instances after job folders are ready
      await Promise.all(
        jobInstancePairs
          .filter((pair: { failed?: boolean }) => !pair.failed)
          .map(async (pair: { job: { JID: string }; instance: { tag: string } }) => {
            const { job, instance } = pair;
            try {
              console.log(
                `[JobRouter] Launching EC2 instance ${instance.tag} for job ${job.JID}`
              );
              await cluster.instance.launch.mutate({
                instanceID: instance.tag,
              });
              console.log(
                `[JobRouter] Successfully launched EC2 instance ${instance.tag}`
              );
              totalApproved++;
            } catch (e) {
              console.error(
                `[JobRouter] Failed to launch EC2 instance ${instance.tag} for job ${job.JID}:`,
                e
              );
              console.error(
                `[JobRouter] Error details:`,
                JSON.stringify(e, null, 2)
              );
              // Job folder exists but instance won't launch - manual intervention needed
            }
          })
      );

      return totalApproved;
    }),
});

export type JobRouter = typeof jobRouter;
