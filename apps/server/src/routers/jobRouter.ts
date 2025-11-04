import crypto from "crypto";

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
                IID: true,
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

        // If job has instanceType but no instance, create one
        let instanceTag = job.instance?.tag;
        if (!instanceTag && job.instanceType) {
          console.log(`Creating new instance of type ${job.instanceType} for job ${jobID}`);
          
          try {
            // Create instance in cluster
            const tag = await cluster.instance.create.mutate({
              instanceType: job.instanceType,
            });
            
            if (!tag) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to create instance in cluster",
              });
            }
            
            // Create instance in database
            const instance = await tx.instance.create({
              data: {
                name: `Auto-${job.instanceType}-${Date.now()}`,
                tag,
                type: job.instanceType,
              },
            });
            
            // Link job to the new instance
            await tx.job.update({
              where: {
                JID: jobID,
              },
              data: {
                instanceId: instance.IID,
              },
            });
            
            instanceTag = tag;
            console.log(`Created instance ${instance.IID} (tag: ${tag}) for job ${jobID}`);
          } catch (error) {
            console.error(`Failed to create instance for job ${jobID}:`, error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Failed to create ${job.instanceType} instance`,
            });
          }
        }

        if (!instanceTag) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job has neither instance nor instanceType",
          });
        }

        // Update job approval status and set to RUNNING immediately
        await tx.job.update({
          where: {
            JID: jobID,
          },
          data: {
            approvalStatus: "APPROVED",
            approvedById: currentUserID,
            approvedAt: new Date(),
            status: "RUNNING", // Show as cracking immediately when approved
          },
        });

        // Create job folder on EFS now that it's approved
        try {
          const hashType = job.hashes[0]?.hashType;
          if (!hashType) {
            throw new Error("Job has no hashes");
          }

          // Create job folder with the existing JID (not a new one)
          await cluster.instance.createJobWithID.mutate({
            instanceID: instanceTag,
            jobID: jobID, // Use the existing database JID
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
                IID: true,
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
            instanceType: true,
          },
        });

        if (jobs.length === 0) {
          return 0;
        }

        // Group jobs by {instanceType, hashType}
        const groupKey = (job: any) => `${job.instanceType || ''}::${job.hashes[0]?.hashType || ''}`;
        const grouped: Record<string, any[]> = {};
        for (const job of jobs) {
          const key = groupKey(job);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(job);
        }

        // For each group, create one instance and assign all jobs in the group to it
        for (const group of Object.values(grouped)) {
          // If any job already has an instance, use it for all in the group
          let instance = group.find((j) => j.instance)?.instance;
          if (!instance) {
            const job0 = group[0];
            if (!job0.instanceType) continue; // skip if no instanceType
            const tag = await cluster.instance.create.mutate({
              instanceType: job0.instanceType,
            });
            if (!tag) continue;
            instance = await tx.instance.create({
              data: {
                name: `Auto-${job0.instanceType}-${Date.now()}`,
                tag,
                type: job0.instanceType,
              },
            });
          }
          // Assign all jobs in group to this instance
          await tx.job.updateMany({
            where: { JID: { in: group.map((j) => j.JID) } },
            data: { instanceId: instance.IID },
          });
          // Update job objects in memory
          for (const job of group) job.instance = { IID: instance.IID, tag: instance.tag };
        }

        // Update all jobs to approved and set to RUNNING
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
            status: "RUNNING",
          },
        });

        // Send all approved jobs to cluster with existing JIDs
        await Promise.allSettled(
          jobs.map(async (job: any) => {
            if (!job.instance?.tag) {
              console.error(`Job ${job.JID} has no instance, skipping cluster send`);
              return;
            }
            try {
              const hashType = job.hashes[0]?.hashType;
              if (!hashType) {
                throw new Error(`Job ${job.JID} has no hashes`);
              }
              await cluster.instance.createJobWithID.mutate({
                instanceID: job.instance.tag,
                jobID: job.JID,
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

  // Request jobs with an instance type (for non-admin users)
  // Admin will approve and create the actual instance
  requestJobs: permissionProcedure(["instances:jobs:add"])
    .input(
      z.object({
        instanceType: z.string(), // e.g., "g5.xlarge", "p3.2xlarge"
        data: z
          .object({
            wordlistID: z.string(),
            hashType: z.number().int().min(0),
            projectIDs: z.string().array(),
          })
          .array(),
      })
    )
    .output(z.string().array())
    .mutation(async (opts) => {
      const { instanceType, data } = opts.input;
      const { prisma, hasPermission, currentUserID } = opts.ctx;
      
      const projectIDs = data.flatMap((job) => job.projectIDs);
      const wordlistIDs = data.map((job) => job.wordlistID);

      return await prisma.$transaction(async (tx: any) => {
        // Verify user has access to projects
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
          projects.map((project: any) => [project.PID, project])
        );

        // Verify wordlists exist
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
        const wordlistIDSet = new Set(wordlists.map(({ WID }: any) => WID));

        // Prepare job data
        const result = await Promise.allSettled(
          data.map(async (job) => {
            if (!wordlistIDSet.has(job.wordlistID)) return null;

            const jobProjects = job.projectIDs
              .map((projectID) => projectMap[projectID]!)
              .filter((project) => project);

            const jobHashes = jobProjects.flatMap((project: any) =>
              project.hashes.filter(
                (hash: any) =>
                  hash.hashType === job.hashType &&
                  hash.status === "NOT_FOUND"
              )
            );

            if (jobHashes.length === 0) return null;

            // Generate job ID
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

        // Create jobs with instanceType but no instanceId
        await Promise.all(
          jobData.map(([{ wordlistID }, hashes, JID]) =>
            tx.job.create({
              data: {
                JID,
                wordlistId: wordlistID,
                instanceType, // Store the requested instance type
                // instanceId is null - will be set when admin approves
                hashes: {
                  connect: hashes.map(({ HID }) => ({ HID })),
                },
                approvalStatus: "PENDING",
                submittedById: currentUserID,
              },
            })
          )
        );

        return jobData.map(([, , JID]) => JID);
      });
    }),
});

export type JobRouter = typeof jobRouter;
