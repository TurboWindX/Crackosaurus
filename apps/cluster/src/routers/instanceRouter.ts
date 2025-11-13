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
  createFolder: publicProcedure
    .input(
      z.object({
        instanceType: z.string(),
      })
    )
    .output(z.string().nullable())
    .mutation(async (opts) => {
      const { instanceType } = opts.input;

      const { cluster } = opts.ctx;
      return await cluster.createInstanceFolder(instanceType);
    }),
  launch: publicProcedure
    .input(
      z.object({
        instanceID: z.string(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { instanceID } = opts.input;

      const { cluster } = opts.ctx;
      await cluster.launchInstance(instanceID);
      return true;
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
  createJobWithID: publicProcedure
    .input(
      z.object({
        instanceID: z.string(),
        jobID: z.string(),
        wordlistID: z.string(),
        hashType: z.number().int().min(0),
        hashes: z.string().array(),
        ruleID: z.string().optional(),
      })
    )
    .output(z.boolean())
    .mutation(async (opts) => {
      const { instanceID, jobID, wordlistID, hashType, hashes, ruleID } =
        opts.input;

      const { cluster } = opts.ctx;

      return await cluster.createJobWithID(
        instanceID,
        jobID,
        wordlistID,
        hashType,
        hashes,
        ruleID
      );
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
