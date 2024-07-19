import { z } from "zod";

import { CLUSTER_STATUS } from "@repo/api";

import { publicProcedure, t } from "../plugins/trpc";

export const infoRouter = t.router({
  type: publicProcedure.output(z.string()).query(async (opts) => {
    const { cluster } = opts.ctx;

    return cluster.getName();
  }),
  status: publicProcedure.output(CLUSTER_STATUS).query(async (opts) => {
    const { cluster } = opts.ctx;

    return await cluster.getStatus();
  }),
});

export type InfoRouter = typeof infoRouter;
