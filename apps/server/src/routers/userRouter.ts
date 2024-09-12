import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PERMISSIONS } from "@repo/api";

import { permissionProcedure, t } from "../plugins/trpc";
import { checkPassword, hashPassword } from "./authRouter";

export const userRouter = t.router({
  get: permissionProcedure(["auth"])
    .input(
      z.object({
        userID: z.string(),
      })
    )
    .output(
      z.object({
        ID: z.string(),
        username: z.string(),
        permissions: z.string(),
        projects: z
          .object({
            PID: z.string(),
            name: z.string(),
          })
          .array()
          .nullable(),
      })
    )
    .query(async (opts) => {
      const { userID } = opts.input;
      const { prisma, hasPermission, currentUserID } = opts.ctx;

      if (!hasPermission("users:get") && userID !== currentUserID)
        throw new TRPCError({ code: "UNAUTHORIZED" });

      return await prisma.$transaction(async (tx) => {
        return await tx.user.findUniqueOrThrow({
          select: {
            ID: true,
            username: true,
            permissions: true,
            projects: {
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
            },
          },
          where: {
            ID: userID,
          },
        });
      });
    }),
  getMany: permissionProcedure(["users:get"])
    .output(
      z
        .object({
          ID: z.string(),
          username: z.string(),
          permissions: z.string(),
          updatedAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        return await tx.user.findMany({
          select: {
            ID: true,
            username: true,
            permissions: true,
            updatedAt: true,
          },
        });
      });
    }),
  getList: permissionProcedure(["users:list"])
    .output(
      z
        .object({
          ID: z.string(),
          username: z.string(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        return await tx.user.findMany({
          select: {
            ID: true,
            username: true,
          },
        });
      });
    }),
  create: permissionProcedure(["users:add"])
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
        permissions: z.enum(PERMISSIONS).array().nullable(),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { username, password, permissions } = opts.input;

      const { prisma, hasPermission } = opts.ctx;

      if ((permissions ?? []).some((permission) => !hasPermission(permission)))
        throw new TRPCError({ code: "UNAUTHORIZED" });

      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          select: {
            ID: true,
          },
          data: {
            username,
            password: await hashPassword(password),
            permissions: permissions?.join(" ") ?? "",
          },
        });

        return user.ID;
      });
    }),
  deleteMany: permissionProcedure(["auth"])
    .input(
      z.object({
        userIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { userIDs } = opts.input;

      const { request, prisma, hasPermission, currentUserID } = opts.ctx;

      if (
        !(
          hasPermission("users:remove") ||
          userIDs.every((userID) => userID === currentUserID)
        )
      )
        throw new TRPCError({ code: "UNAUTHORIZED" });

      return await prisma.$transaction(async (tx) => {
        const { count } = await tx.user.deleteMany({
          where: {
            ID: {
              in: userIDs,
            },
            permissions: {
              notIn: ["root"],
            },
          },
        });

        if (count === 0) throw new TRPCError({ code: "BAD_REQUEST" });

        if (userIDs.some((userID) => userID === currentUserID))
          await request.session.destroy();

        return count;
      });
    }),
  addPermissions: permissionProcedure(["users:edit"])
    .input(
      z.object({
        userID: z.string(),
        permissions: z.enum(PERMISSIONS).array(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { userID, permissions } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      if (permissions.some((permission) => !hasPermission(permission)))
        throw new TRPCError({ code: "UNAUTHORIZED" });

      if (userID === currentUserID)
        throw new TRPCError({ code: "BAD_REQUEST" });

      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          select: {
            permissions: true,
          },
          where: {
            ID: userID,
          },
        });

        const permissionSet = new Set(user.permissions.split(" "));

        permissions.forEach((permission) => permissionSet.add(permission));

        await tx.user.update({
          where: {
            ID: userID,
          },
          data: {
            permissions: [...permissionSet].join(" "),
          },
        });

        return true;
      });
    }),
  removePermissions: permissionProcedure(["users:edit"])
    .input(
      z.object({
        userID: z.string(),
        permissions: z.enum(PERMISSIONS).array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { userID, permissions } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      if (permissions.some((permission) => !hasPermission(permission)))
        throw new TRPCError({ code: "UNAUTHORIZED" });

      if (userID === currentUserID)
        throw new TRPCError({ code: "BAD_REQUEST" });

      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          select: {
            permissions: true,
          },
          where: {
            ID: userID,
          },
        });

        const permissionSet = new Set(user.permissions.split(" "));

        permissions.forEach((permission) => permissionSet.delete(permission));

        await tx.user.update({
          where: {
            ID: userID,
          },
          data: {
            permissions: [...permissionSet].join(" "),
          },
        });

        return permissionSet.size;
      });
    }),
  updatePassword: permissionProcedure(["auth"])
    .input(
      z.object({
        userID: z.string(),
        oldPassword: z.string(),
        newPassword: z.string(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { userID, oldPassword, newPassword } = opts.input;

      const { prisma, hasPermission, currentUserID } = opts.ctx;

      if (!hasPermission("users:edit") && userID !== currentUserID)
        throw new TRPCError({ code: "UNAUTHORIZED" });

      return await prisma.$transaction(async (tx) => {
        // Check if old password is valid or bypass
        if (!hasPermission("users:edit")) {
          const user = await tx.user.findUniqueOrThrow({
            select: {
              password: true,
            },
            where: {
              ID: userID,
            },
          });

          if (!(await checkPassword(oldPassword, user.password)))
            throw new TRPCError({ code: "BAD_REQUEST" });
        }

        // Update password for user
        await tx.user.update({
          where: {
            ID: userID,
          },
          data: {
            password: await hashPassword(newPassword),
            updatedAt: new Date(),
          },
        });

        return true;
      });
    }),
});

export type UserRouter = typeof userRouter;
