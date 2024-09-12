import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";

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
                updatedAt: z.date(),
                instance: z.object({
                  IID: z.string(),
                  name: z.string().nullable(),
                }),
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

      return await prisma.$transaction(async (tx) => {
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
                    jobs: hasPermission("instances:jobs:get")
                      ? {
                          select: {
                            JID: true,
                            status: true,
                            updatedAt: true,
                            instance: {
                              select: {
                                IID: true,
                                name: true,
                              },
                            },
                          },
                        }
                      : undefined,
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

      return await prisma.$transaction(async (tx) => {
        return await tx.project.findMany({
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

      return await prisma.$transaction(async (tx) => {
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

      return await prisma.$transaction(async (tx) => {
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

      return await prisma.$transaction(async (tx) => {
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
              in: projects.map((project) => project.PID),
            },
          },
        });

        const { count } = await tx.project.deleteMany({
          where: {
            PID: {
              in: projects.map((project) => project.PID),
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

      return await prisma.$transaction(async (tx) => {
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

      return await prisma.$transaction(async (tx) => {
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
