import { z } from "zod";

import { publicProcedure, t } from "../plugins/trpc";

export const instanceRouter = t.router({
  create: publicProcedure
    .input(
      z.object({
        instanceType: z.string(),
      })
    )
    .output(z.string().nullable())
    .mutation(async (opts) => {
      const { instanceType } = opts.input;

      const { cluster } = opts.ctx;
      return await cluster.createInstance(instanceType);
    }),
  deleteMany: publicProcedure
    .input(
      z.object({
        instanceIDs: z.string().array(),
      })
    )
    .output(z.boolean().array())
    .mutation(async (opts) => {
      const { instanceIDs } = opts.input;

      const { cluster } = opts.ctx;

      const result = await Promise.allSettled(
        instanceIDs.map((instanceID) => cluster.deleteInstance(instanceID))
      );

      return result.map((r) => r.status === "fulfilled" && r.value);
    }),
  createJob: publicProcedure
    .input(
      z.object({
        instanceID: z.string(),
        wordlistID: z.string(),
        hashType: z.number().int().min(0),
        hashes: z.string().array(),
      })
    )
    .output(z.string().nullable())
    .mutation(async (opts) => {
      const { instanceID, wordlistID, hashType, hashes } = opts.input;

      const { cluster } = opts.ctx;

      return await cluster.createJob(instanceID, wordlistID, hashType, hashes);
    }),
  deleteJobs: publicProcedure
    .input(
      z.object({
        instanceID: z.string(),
        jobIDs: z.string().array(),
      })
    )
    .output(z.boolean().array())
    .mutation(async (opts) => {
      const { instanceID, jobIDs } = opts.input;

      const { cluster } = opts.ctx;

      const result = await Promise.allSettled(
        jobIDs.map((jobID) => cluster.deleteJob(instanceID, jobID))
      );

      return result.map((r) => r.status === "fulfilled" && r.value);
    }),
});

export type InstanceRouter = typeof instanceRouter;
