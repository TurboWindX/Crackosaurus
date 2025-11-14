import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export const projectRouter = t.router({
  get: permissionProcedure(["auth"])
    .input(
      z.object({
        projectID: z.string(),
      })
    )
    .output(
      z.object({
        PID: z.string(),
        name: z.string(),
        updatedAt: z.date(),
        members: z
          .object({
            ID: z.string(),
            username: z.string(),
          })
          .array()
          .optional(),
        hashes: z
          .object({
            HID: z.string(),
            hash: z.string(),
            hashType: z.number().int().min(0),
            value: z.string().nullable().optional(),
            status: z.string(),
            updatedAt: z.date(),
            jobs: z
              .object({
                JID: z.string(),
                status: z.string(),
                approvalStatus: z.string().nullable().optional(),
                submittedById: z.string().nullable().optional(),
                submittedBy: z
                  .object({
                    ID: z.string(),
                    username: z.string(),
                  })
                  .nullable()
                  .optional(),
                wordlistId: z.string().nullable(),
                wordlist: z
                  .object({
                    WID: z.string(),
                    name: z.string().nullable(),
                  })
                  .nullable(),
                updatedAt: z.date(),
                instanceType: z.string().nullable().optional(), // Requested instance type
                instance: z
                  .object({
                    IID: z.string(),
                    name: z.string().nullable(),
                  })
                  .nullable()
                  .optional(), // Nullable until instance is created
              })
              .array()
              .optional(),
          })
          .array()
          .optional(),
      })
    )
    .query(async (opts) => {
      const { projectID } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        return await tx.project.findUniqueOrThrow({
          select: {
            PID: true,
            name: true,
            updatedAt: true,
            members: hasPermission("projects:users:get")
              ? {
                  select: {
                    ID: true,
                    username: true,
                  },
                }
              : undefined,
            hashes: hasPermission("hashes:get")
              ? {
                  select: {
                    HID: true,
                    hash: true,
                    hashType: true,
                    value: hasPermission("hashes:view"),
                    status: true,
                    updatedAt: true,
                    jobs: {
                      // If the current user lacks instances:jobs:get, only include jobs
                      // that the current user submitted. Admins see all jobs.
                      where: hasPermission("instances:jobs:get")
                        ? undefined
                        : {
                            submittedById: currentUserID,
                          },
                      select: {
                        JID: true,
                        status: true,
                        approvalStatus: true,
                        submittedById: true,
                        submittedBy: {
                          select: {
                            ID: true,
                            username: true,
                          },
                        },
                        wordlistId: true,
                        wordlist: {
                          select: {
                            WID: true,
                            name: true,
                          },
                        },
                        updatedAt: true,
                        instanceType: true, // Include requested instance type
                        instance: {
                          select: {
                            IID: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                }
              : undefined,
          },
          where: {
            PID: projectID,
            members: hasPermission("projects:get")
              ? undefined
              : {
                  some: {
                    ID: currentUserID,
                  },
                },
          },
        });
      });
    }),
  getMany: permissionProcedure(["auth"])
    .output(
      z
        .object({
          PID: z.string(),
          name: z.string(),
          updatedAt: z.date(),
          pendingJobsCount: z.number().int().optional(),
          members: z
            .object({
              ID: z.string(),
              username: z.string(),
            })
            .array()
            .optional(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        const projects = await tx.project.findMany({
          select: {
            PID: true,
            name: true,
            updatedAt: true,
            members: hasPermission("projects:users:get")
              ? {
                  select: {
                    ID: true,
                    username: true,
                  },
                }
              : undefined,
            hashes: {
              select: {
                jobs: {
                  select: {
                    JID: true,
                    approvalStatus: true,
                  },
                  where: {
                    approvalStatus: "PENDING",
                  },
                },
              },
            },
          },
          where: hasPermission("root")
            ? undefined
            : {
                members: {
                  some: {
                    ID: currentUserID,
                  },
                },
              },
        });

        // Calculate pending jobs count per project
        return projects.map((project: { PID: string; name: string; updatedAt: Date; hashes: { jobs: { approvalStatus: string }[] }[]; members: unknown[] }) => ({
          PID: project.PID,
          name: project.name,
          updatedAt: project.updatedAt,
          pendingJobsCount: project.hashes
            .flatMap((hash: { jobs: { approvalStatus: string }[] }) => hash.jobs)
            .filter((job: { approvalStatus: string }) => job.approvalStatus === "PENDING").length,
          members: project.members,
        }));
      });
    }),
  getList: permissionProcedure(["auth"])
    .output(
      z
        .object({
          PID: z.string(),
          name: z.string(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        return await tx.project.findMany({
          select: {
            PID: true,
            name: true,
          },
          where: hasPermission("projects:get")
            ? undefined
            : {
                members: {
                  some: {
                    ID: currentUserID,
                  },
                },
              },
        });
      });
    }),
  create: permissionProcedure(["projects:add"])
    .input(
      z.object({
        projectName: z.string(),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { projectName } = opts.input;

      const { prisma, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        const project = await tx.project.create({
          select: {
            PID: true,
          },
          data: {
            name: projectName,
            members: {
              connect: {
                ID: currentUserID,
              },
            },
          },
        });

        return project.PID;
      });
    }),
  deleteMany: permissionProcedure(["projects:remove"])
    .input(
      z.object({
        projectIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { projectIDs } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
        const projects = await tx.project.findMany({
          select: {
            PID: true,
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

        await tx.hash.deleteMany({
          where: {
            projectId: {
              in: projects.map((project: { PID: string }) => project.PID),
            },
          },
        });

        const { count } = await tx.project.deleteMany({
          where: {
            PID: {
              in: projects.map((project: { PID: string }) => project.PID),
            },
          },
        });

        return count;
      });
    }),
  addUsers: permissionProcedure(["projects:users:add"])
    .input(
      z.object({
        projectID: z.string(),
        userIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { projectID, userIDs } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
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
            members: {
              connect: userIDs.map((ID) => ({ ID })),
            },
          },
        });

        return userIDs.length;
      });
    }),
  removeUsers: permissionProcedure(["projects:users:remove"])
    .input(
      z.object({
        projectID: z.string(),
        userIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { projectID, userIDs } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: TransactionClient) => {
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
            members: {
              disconnect: userIDs
                .filter((ID) => ID !== currentUserID)
                .map((ID) => ({ ID })),
            },
          },
        });

        return userIDs.length;
      });
    }),
});

export type ProjectRouter = typeof projectRouter;
