import { TRPCError, initTRPC } from "@trpc/server";
import { ZodError } from "zod";

import { PermissionType } from "@repo/api";

import { Context } from "./context";

export const t = initTRPC.context<Context>().create({
  // Surface zod input-validation failures under `data.zodError` so the client
  // can tell a schema rejection (generic "Invalid input") apart from a custom
  // BAD_REQUEST message (e.g. "Password must be at least 15 characters"),
  // which it then shows verbatim instead of the generic code translation.
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const publicProcedure = t.procedure;

export const permissionProcedure = (permissions: PermissionType[]) =>
  publicProcedure.use(async (opts) => {
    const { hasPermission } = opts.ctx;

    if (!permissions.every(hasPermission))
      throw new TRPCError({ code: "UNAUTHORIZED" });

    return opts.next();
  });
