import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PERMISSIONS, hasPermission as checkPermission } from "@repo/api";

import { permissionProcedure, t } from "../plugins/trpc";
import { checkPassword, hashPassword } from "./authRouter";

/**
 * A "privileged" account is one that holds a wildcard/root grant ("*" or
 * "root"). These accounts must not be mutated by a delegated `users:edit`
 * holder who is not themselves privileged, otherwise a lower-tier admin could
 * take over the root account (reset its password, delete it, etc.).
 */
function isPrivilegedPermissionString(permissions: string): boolean {
  return checkPermission(permissions, "*") || checkPermission(permissions, "root");
}

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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Never delete privileged (root/`*`) accounts. A DB-level
        // `notIn: ["root","*"]` only matches single-token permission strings;
        // a privileged account whose column has any extra token (e.g.
        // "root hashes:get") would slip past it. Resolve the actual permission
        // strings and filter privileged accounts out in code instead.
        const candidates = await tx.user.findMany({
          select: { ID: true, permissions: true },
          where: { ID: { in: userIDs } },
        });

        const deletableIDs = candidates
          .filter((u) => !isPrivilegedPermissionString(u.permissions))
          .map((u) => u.ID);

        const { count } = await tx.user.deleteMany({
          where: {
            ID: {
              in: deletableIDs,
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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUniqueOrThrow({
          select: {
            permissions: true,
          },
          where: {
            ID: userID,
          },
        });

        const permissionSet = new Set(
          user.permissions.split(" ").filter(Boolean)
        );

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

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUniqueOrThrow({
          select: {
            permissions: true,
          },
          where: {
            ID: userID,
          },
        });

        const permissionSet = new Set(
          user.permissions.split(" ").filter(Boolean)
        );

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

      const isSelf = userID === currentUserID;
      const callerIsPrivileged =
        hasPermission("*") || hasPermission("root");

      if (!hasPermission("users:edit") && !isSelf)
        throw new TRPCError({ code: "UNAUTHORIZED" });

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUniqueOrThrow({
          select: {
            password: true,
            permissions: true,
          },
          where: {
            ID: userID,
          },
        });

        // A delegated `users:edit` holder must NOT reset a privileged
        // (root/`*`) account's password unless they are themselves privileged
        // or acting on their own account. Prevents lower-tier admin -> root
        // takeover.
        if (
          !isSelf &&
          !callerIsPrivileged &&
          isPrivilegedPermissionString(user.permissions)
        )
          throw new TRPCError({ code: "UNAUTHORIZED" });

        // The old-password check is only bypassed when a `users:edit` holder
        // resets ANOTHER account. Self-service password changes must always
        // prove knowledge of the current password.
        if (!hasPermission("users:edit") || isSelf) {
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
