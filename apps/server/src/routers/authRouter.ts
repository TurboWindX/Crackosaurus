import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { z } from "zod";

import { PERMISSIONS, PermissionType } from "@repo/api";

import { permissionProcedure, publicProcedure, t } from "../plugins/trpc";

declare module "fastify" {
  interface Session {
    uid: string;
    username: string;
    permissions: string;
  }
}

export async function checkPassword(
  inputPassword: string,
  dbPassword: string
): Promise<boolean> {
  return bcrypt.compare(inputPassword, dbPassword);
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 8;

  return bcrypt.hash(password, saltRounds);
}

export const authRouter = t.router({
  get: permissionProcedure(["auth"])
    .output(
      z.object({
        uid: z.string(),
        username: z.string(),
        permissions: z.enum(PERMISSIONS).array(),
      })
    )
    .query((opts) => {
      const { request } = opts.ctx;

      return {
        uid: request.session.uid,
        username: request.session.username,
        permissions: request.session.permissions.split(" ") as PermissionType[],
      } as const;
    }),
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { username, password } = opts.input;
      const { request, prisma } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          select: {
            ID: true,
            username: true,
            permissions: true,
            password: true,
          },
          where: {
            username: username,
          },
        });
        if (user === null) throw new TRPCError({ code: "BAD_REQUEST" });

        if (!(await checkPassword(password, user.password)))
          throw new TRPCError({ code: "BAD_REQUEST" });

        await request.session.regenerate();

        request.session.uid = user.ID;
        request.session.username = user.username;
        request.session.permissions = user.permissions;

        return user.ID;
      });
    }),
  logout: permissionProcedure(["auth"])
    .output(z.boolean())
    .mutation(async (opts) => {
      const { request } = opts.ctx;

      await request.session.destroy();

      return true;
    }),
});

export type AuthRouter = typeof authRouter;
