import type { Context } from "../src/plugins/trpc/context";

export interface MockCtxOpts {
  /** Permission strings the caller holds ("*" = privileged/all). */
  permissions?: string[];
  /** Override the permission check directly. */
  hasPermission?: (permission: string) => boolean;
  /** Authorization header value, e.g. `Bearer <secret>`, for serviceProcedure. */
  authorization?: string;
  currentUserID?: string;
  /** Partial prisma client; only the methods a resolver touches are needed. */
  prisma?: unknown;
  cluster?: unknown;
  session?: Record<string, unknown>;
}

/**
 * Build a mock tRPC Context for `router.createCaller(...)`. No fastify, no DB,
 * no HTTP — just enough shape for the middleware (permission / service-secret)
 * and, when a test exercises a resolver, the prisma methods it calls.
 */
export function makeContext(opts: MockCtxOpts = {}): Context {
  const grants = new Set(opts.permissions ?? []);
  const hasPermission =
    opts.hasPermission ??
    ((permission: string) => grants.has(permission) || grants.has("*"));

  const prisma = opts.prisma ?? {};

  return {
    request: {
      headers: { authorization: opts.authorization },
      session: opts.session ?? {},
      server: { prisma },
    },
    prisma,
    cluster: opts.cluster ?? {},
    hasPermission,
    currentUserID: opts.currentUserID ?? "",
  } as unknown as Context;
}

/** The service secret the test env configured (see setup.ts). */
export const SERVICE_SECRET = process.env.SERVICE_SECRET as string;
