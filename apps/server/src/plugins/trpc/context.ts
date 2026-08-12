import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { PermissionType, hasPermission } from "@repo/api";

import { trpc } from "../cluster/trpc";

export async function createContext({
  req: request,
}: CreateFastifyContextOptions) {
  const prisma = request.server.prisma;
  const sessionUid = request.session.uid;

  // Resolve permissions from live DB state on every request instead of trusting
  // the snapshot frozen into the session at login. This makes permission
  // revocation, demotion, and account deletion take effect on the caller's
  // next request rather than persisting for the (rolling, non-expiring) life of
  // the session.
  let permissions = "";
  let currentUserID = "";
  if (sessionUid) {
    const user = await prisma.user.findUnique({
      select: { permissions: true },
      where: { ID: sessionUid },
    });
    if (user) {
      permissions = user.permissions;
      currentUserID = sessionUid;
      // Keep the cached snapshot in sync so the non-tRPC readers that still
      // consult request.session.permissions (upload preHandler, WebSocket,
      // authRouter.get) observe the same live value within this request.
      request.session.permissions = user.permissions;
    }
    // If the session's user no longer exists we simply leave permissions="" and
    // currentUserID="". Do NOT destroy the session here: @fastify/session's
    // destroy() nulls request.session synchronously, and createContext runs
    // before every procedure — including the publicProcedure `login`, which
    // then calls request.session.regenerate() on a null session and throws.
    // The stale session is already inert (permissions="") because we re-resolve
    // from the DB on every request, so no server-side invalidation is needed.
  }

  return {
    request,
    prisma,
    cluster: trpc,
    hasPermission: (permission: PermissionType) =>
      hasPermission(permissions, permission),
    currentUserID,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
