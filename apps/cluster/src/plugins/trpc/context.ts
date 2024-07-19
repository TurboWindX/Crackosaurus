import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { Cluster } from "../../cluster/cluster";

export async function createContext({
  req: request,
}: CreateFastifyContextOptions) {
  return {
    request,
    cluster: (request.server as any).cluster as Cluster<any>,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
