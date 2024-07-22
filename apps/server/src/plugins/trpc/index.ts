import { TRPCError, initTRPC } from "@trpc/server";

import { PermissionType } from "@repo/api";

import { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure;

export const permissionProcedure = (permissions: PermissionType[]) =>
  publicProcedure.use(async (opts) => {
    const { hasPermission } = opts.ctx;

    if (!permissions.every(hasPermission))
      throw new TRPCError({ code: "UNAUTHORIZED" });

    return opts.next();
  });
