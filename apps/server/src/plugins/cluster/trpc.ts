import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";

import type { AppRouter } from "@repo/cluster";

import config from "../../config";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `http://${config.cluster.name}:${config.cluster.port}/trpc`,
    }),
  ],
});
