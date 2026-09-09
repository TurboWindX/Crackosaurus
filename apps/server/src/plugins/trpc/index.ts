import { TRPCError, initTRPC } from "@trpc/server";
import crypto from "crypto";
import { ZodError } from "zod";

import { PermissionType } from "@repo/api";

import config from "../../config";
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

// Constant-time compare that first hashes both sides to a fixed-length digest,
// hiding the secret's length and removing the early-exit timing side-channel of
// a plain `!==`. Mirrors the cluster's server→cluster auth check (see
// apps/cluster/src/index.ts) so both directions use the same primitive.
function timingSafeStrEqual(a: string, b: string): boolean {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

/**
 * Machine-to-machine procedure gated by a shared service secret presented as
 * `Authorization: Bearer <SERVICE_SECRET>` (falling back to CLUSTER_SECRET).
 *
 * No user session is involved — these endpoints are for trusted automation (the
 * NetNTLMv1 rainbow lookup runner), never the browser: a browser carries a
 * session cookie, not a Bearer token, so it can never satisfy this gate, and
 * the runner carries no session, so it can never satisfy permissionProcedure.
 * Fails closed (UNAUTHORIZED) when no service secret is configured.
 */
export const serviceProcedure = publicProcedure.use(async (opts) => {
  const secret = config.serviceSecret;
  const authHeader = opts.ctx.request.headers.authorization;

  if (
    !secret ||
    !authHeader ||
    !timingSafeStrEqual(authHeader, `Bearer ${secret}`)
  )
    throw new TRPCError({ code: "UNAUTHORIZED" });

  return opts.next();
});
