import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { Cluster } from "../../cluster/cluster";

export async function createContext({
  req: request,
}: CreateFastifyContextOptions) {
  return {
    request,
    cluster: (request.server as unknown as Record<string, Cluster<unknown>>)
      .cluster!,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
