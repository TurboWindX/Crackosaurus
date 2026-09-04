import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PERMISSIONS, hasPermission as checkPermission } from "@repo/api";

import { permissionProcedure, t } from "../plugins/trpc";
import { checkPasswordStrength } from "../utils/password";
import {
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  qrDataUrl,
  verifyTotp,
} from "../utils/totp";
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
        mfaEnabled: z.boolean(),
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
            mfaEnabled: true,
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

      checkPasswordStrength(password);

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
          .filter(
            (u: { ID: string; permissions: string }) =>
              !isPrivilegedPermissionString(u.permissions)
          )
          .map((u: { ID: string; permissions: string }) => u.ID);

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

      checkPasswordStrength(newPassword);

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

        // A `users:edit` holder (admin) can SET a password without knowing the
        // current one — for any account, including their own. Only an
        // unprivileged user changing their own password must prove knowledge of
        // the current password (self-service change on a non-admin session).
        // The privileged-account guard above still blocks a lower-tier admin
        // from resetting a root/`*` account.
        if (!hasPermission("users:edit")) {
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
  // ── TOTP multi-factor auth (self-service) ──────────────────────────────────
  //
  // Enrollment is two steps so a user cannot lock themselves out with a
  // mistyped secret: startMfaEnrollment stashes an (encrypted, not-yet-active)
  // secret and returns a QR/URI; confirmMfaEnrollment verifies a live code
  // before flipping mfaEnabled on and issuing recovery codes.
  startMfaEnrollment: permissionProcedure(["auth"])
    .output(
      z.object({
        secret: z.string(),
        otpauthUri: z.string(),
        qrDataUrl: z.string(),
      })
    )
    .mutation(async (opts) => {
      const { prisma, currentUserID } = opts.ctx;

      const secret = generateTotpSecret();

      const otpauthUri = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const user = await tx.user.findUniqueOrThrow({
            select: { username: true, mfaEnabled: true },
            where: { ID: currentUserID },
          });

          // Re-enrolling while active could silently swap the secret; require an
          // explicit disable first so recovery codes and state stay consistent.
          if (user.mfaEnabled) throw new TRPCError({ code: "BAD_REQUEST" });

          await tx.user.update({
            where: { ID: currentUserID },
            data: { totpSecret: encryptSecret(secret) },
          });

          return buildTotpUri(secret, user.username);
        }
      );

      return {
        secret,
        otpauthUri,
        qrDataUrl: await qrDataUrl(otpauthUri),
      };
    }),
  confirmMfaEnrollment: permissionProcedure(["auth"])
    .input(
      z.object({
        code: z.string(),
      })
    )
    .output(
      z.object({
        recoveryCodes: z.string().array(),
      })
    )
    .mutation(async (opts) => {
      const { code } = opts.input;
      const { prisma, currentUserID } = opts.ctx;

      const recoveryCodes = generateRecoveryCodes();
      const recoveryHashes = await Promise.all(
        recoveryCodes.map((c) => hashRecoveryCode(c))
      );

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUniqueOrThrow({
          select: { totpSecret: true, mfaEnabled: true },
          where: { ID: currentUserID },
        });

        if (user.mfaEnabled) throw new TRPCError({ code: "BAD_REQUEST" });
        if (!user.totpSecret) throw new TRPCError({ code: "BAD_REQUEST" });

        const step = verifyTotp(decryptSecret(user.totpSecret), code);
        if (step === null) throw new TRPCError({ code: "BAD_REQUEST" });

        // Replace any stale codes from a previous enrollment, then issue fresh.
        await tx.userRecoveryCode.deleteMany({
          where: { userId: currentUserID },
        });
        await tx.userRecoveryCode.createMany({
          data: recoveryHashes.map((codeHash) => ({
            userId: currentUserID,
            codeHash,
          })),
        });

        // Record the confirming code's step so it cannot be immediately replayed
        // at login before the next 30s window.
        await tx.user.update({
          where: { ID: currentUserID },
          data: { mfaEnabled: true, totpLastStep: step },
        });

        return { recoveryCodes };
      });
    }),
  disableMfa: permissionProcedure(["auth"])
    .input(
      z.object({
        password: z.string(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { password } = opts.input;
      const { prisma, currentUserID } = opts.ctx;

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUniqueOrThrow({
          select: { password: true },
          where: { ID: currentUserID },
        });

        // Disabling a security control requires proving knowledge of the
        // current password, so a hijacked session alone cannot strip MFA.
        if (!(await checkPassword(password, user.password)))
          throw new TRPCError({ code: "BAD_REQUEST" });

        await tx.userRecoveryCode.deleteMany({
          where: { userId: currentUserID },
        });
        await tx.user.update({
          where: { ID: currentUserID },
          data: { mfaEnabled: false, totpSecret: null, totpLastStep: null },
        });

        return true;
      });
    }),
});

export type UserRouter = typeof userRouter;
