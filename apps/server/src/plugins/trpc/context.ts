import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { PermissionType, hasPermission } from "@repo/api";

import { trpc } from "../cluster/trpc";

export async function createContext({
  req: request,
}: CreateFastifyContextOptions) {
  return {
    request,
    prisma: request.server.prisma,
    cluster: trpc,
    hasPermission: (permission: PermissionType) =>
      hasPermission(request.session.permissions ?? [], permission),
    currentUserID: request.session.uid ?? "",
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
