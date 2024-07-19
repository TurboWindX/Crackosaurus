import { z } from "zod";

import { publicProcedure, t } from "../plugins/trpc";

export const wordlistRouter = t.router({
  deleteMany: publicProcedure
    .input(
      z.object({
        wordlistIDs: z.string().array(),
      })
    )
    .output(z.boolean().array())
    .mutation(async (opts) => {
      const { wordlistIDs } = opts.input;

      const { cluster } = opts.ctx;

      const result = await Promise.allSettled(
        wordlistIDs.map((wordlistID) => cluster.deleteWordlist(wordlistID))
      );

      return result.map((r) => r.status === "fulfilled" && r.value);
    }),
});

export type WordlistRouter = typeof wordlistRouter;
