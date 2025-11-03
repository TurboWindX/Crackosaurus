import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";

export const jobRouter = t.router({
  // Get all pending jobs (admin only)
  getPending: permissionProcedure(["jobs:approve"])
    .output(
      z
        .object({
          JID: z.string(),
          status: z.string(),
          approvalStatus: z.string(),
          submittedBy: z
            .object({
              ID: z.string(),
              username: z.string(),
            })
            .nullable(),
          instance: z.object({
            IID: z.string(),
            name: z.string().nullable(),
            type: z.string().nullable(),
          }),
          wordlist: z
            .object({
              WID: z.string(),
              name: z.string().nullable(),
              size: z.bigint(),
            })
            .nullable(),
          hashes: z
            .object({
              HID: z.string(),
              hash: z.string(),
              hashType: z.number(),
              project: z.object({
                PID: z.string(),
                name: z.string(),
              }),
            })
            .array(),
          createdAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: any) => {
        return await tx.job.findMany({
          where: {
            approvalStatus: "PENDING",
          },
          include: {
            submittedBy: {
              select: {
                ID: true,
                username: true,
              },
            },
            instance: {
              select: {
                IID: true,
                name: true,
                type: true,
              },
            },
            wordlist: {
              select: {
                WID: true,
                name: true,
                size: true,
              },
            },
            hashes: {
              select: {
                HID: true,
                hash: true,
                hashType: true,
                project: {
                  select: {
                    PID: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      });
    }),

  // Get user's own submitted jobs
  getMy: permissionProcedure(["jobs:view"])
    .output(
      z
        .object({
          JID: z.string(),
          status: z.string(),
          approvalStatus: z.string(),
          approvedBy: z
            .object({
              ID: z.string(),
              username: z.string(),
            })
            .nullable(),
          approvedAt: z.date().nullable(),
          rejectionNote: z.string().nullable(),
          instance: z.object({
            IID: z.string(),
            name: z.string().nullable(),
          }),
          wordlist: z
            .object({
              WID: z.string(),
              name: z.string().nullable(),
            })
            .nullable(),
          createdAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: any) => {
        return await tx.job.findMany({
          where: {
            submittedById: currentUserID,
          },
          include: {
            approvedBy: {
              select: {
                ID: true,
                username: true,
              },
            },
            instance: {
              select: {
                IID: true,
                name: true,
              },
            },
            wordlist: {
              select: {
                WID: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      });
    }),

  // Approve a job (admin only)
  approve: permissionProcedure(["jobs:approve"])
    .input(
      z.object({
        jobID: z.string(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID } = opts.input;
      const { prisma, currentUserID, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: any) => {
        const job = await tx.job.findUniqueOrThrow({
          where: {
            JID: jobID,
          },
          include: {
            instance: {
              select: {
                tag: true,
              },
            },
            wordlist: {
              select: {
                WID: true,
              },
            },
            hashes: {
              select: {
                hash: true,
                hashType: true,
              },
            },
          },
        });

        if (job.approvalStatus !== "PENDING") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job is not pending approval",
          });
        }

        // Update job approval status
        await tx.job.update({
          where: {
            JID: jobID,
          },
          data: {
            approvalStatus: "APPROVED",
            approvedById: currentUserID,
            approvedAt: new Date(),
          },
        });

        // Send job to cluster now that it's approved
        try {
          const hashType = job.hashes[0]?.hashType;
          if (!hashType) {
            throw new Error("Job has no hashes");
          }

          await cluster.instance.createJob.mutate({
            instanceID: job.instance.tag,
            wordlistID: job.wordlist!.WID,
            hashType: hashType,
            hashes: job.hashes.map((h: any) => h.hash),
          });
        } catch (error) {
          console.error(`Failed to send approved job ${jobID} to cluster:`, error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to start job on cluster",
          });
        }

        return true;
      });
    }),

  // Approve multiple jobs (admin only)
  approveMany: permissionProcedure(["jobs:approve"])
    .input(
      z.object({
        jobIDs: z.string().array(),
      })
    )
    .output(z.number())
    .mutation(async (opts) => {
      const { jobIDs } = opts.input;
      const { prisma, currentUserID, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: any) => {
        const jobs = await tx.job.findMany({
          where: {
            JID: {
              in: jobIDs,
            },
            approvalStatus: "PENDING",
          },
          include: {
            instance: {
              select: {
                tag: true,
              },
            },
            wordlist: {
              select: {
                WID: true,
              },
            },
            hashes: {
              select: {
                hash: true,
                hashType: true,
              },
            },
          },
        });

        if (jobs.length === 0) {
          return 0;
        }

        // Update all jobs to approved
        await tx.job.updateMany({
          where: {
            JID: {
              in: jobs.map((j: any) => j.JID),
            },
          },
          data: {
            approvalStatus: "APPROVED",
            approvedById: currentUserID,
            approvedAt: new Date(),
          },
        });

        // Send all approved jobs to cluster
        await Promise.allSettled(
          jobs.map(async (job: any) => {
            try {
              const hashType = job.hashes[0]?.hashType;
              if (!hashType) {
                throw new Error(`Job ${job.JID} has no hashes`);
              }

              await cluster.instance.createJob.mutate({
                instanceID: job.instance.tag,
                wordlistID: job.wordlist!.WID,
                hashType: hashType,
                hashes: job.hashes.map((h: any) => h.hash),
              });
            } catch (error) {
              console.error(`Failed to send approved job ${job.JID} to cluster:`, error);
            }
          })
        );

        return jobs.length;
      });
    }),

  // Reject a job (admin only)
  reject: permissionProcedure(["jobs:approve"])
    .input(
      z.object({
        jobID: z.string(),
        note: z.string().optional(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID, note } = opts.input;
      const { prisma, currentUserID, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: any) => {
        const job = await tx.job.findUniqueOrThrow({
          where: {
            JID: jobID,
          },
          include: {
            instance: {
              select: {
                tag: true,
              },
            },
          },
        });

        if (job.approvalStatus !== "PENDING") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job is not pending approval",
          });
        }

        // Update job approval status
        await tx.job.update({
          where: {
            JID: jobID,
          },
          data: {
            approvalStatus: "REJECTED",
            approvedById: currentUserID,
            approvedAt: new Date(),
            rejectionNote: note,
          },
        });

        // Delete the job from cluster
        try {
          await cluster.instance.deleteJobs.mutate({
            instanceID: job.instance.tag,
            jobIDs: [jobID],
          });
        } catch (error) {
          console.error(`Failed to delete rejected job ${jobID} from cluster:`, error);
        }

        return true;
      });
    }),

  // Delete a rejected/approved job from history
  delete: permissionProcedure(["jobs:approve"])
    .input(
      z.object({
        jobID: z.string(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { jobID } = opts.input;
      const { prisma } = opts.ctx;

      await prisma.$transaction(async (tx: any) => {
        await tx.job.delete({
          where: {
            JID: jobID,
          },
        });
      });

      return true;
    }),
});

export type JobRouter = typeof jobRouter;
