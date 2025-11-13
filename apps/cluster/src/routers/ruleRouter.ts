import { z } from "zod";

import { t } from "../plugins/trpc";

// Schema for rule upload
const ruleUploadSchema = z.object({
  data: z.string(), // base64-encoded rule file
});

export const ruleRouter = t.router({
  upload: t.procedure
    .input(ruleUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.data, "base64");
      const ruleID = await ctx.cluster.createRule(buffer);
      return { ruleID };
    }),

  list: t.procedure.query(async ({ ctx }) => {
    // Implement listing rules (assuming cluster exposes a method)
    if (typeof ctx.cluster.listRules === "function") {
      return await ctx.cluster.listRules();
    }
    throw new Error("Listing rules not supported by this cluster type.");
  }),

  delete: t.procedure
    .input(z.object({ ruleID: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const success = await ctx.cluster.deleteRule(input.ruleID);
      return { success };
    }),
});

export type RuleRouter = typeof ruleRouter;
