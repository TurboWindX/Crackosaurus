import type { Prisma } from "@prisma/client";
import { TRPCError, inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, t } from "../plugins/trpc";
import { authRouter, hashPassword } from "./authRouter";
import { hashRouter } from "./hashRouter";
import { instanceRouter } from "./instanceRouter";
import { jobRouter } from "./jobRouter";
import { projectRouter } from "./projectRouter";
import { ruleRouter } from "./ruleRouter";
import { userRouter } from "./userRouter";
import { wordlistRouter } from "./wordlistRouter";

export const appRouter = t.router({
  ping: publicProcedure.query(() => "pong"),
  init: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { username, password } = opts.input;
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const firstUser = await tx.user.findFirst({
          select: {
            ID: true,
          },
        });

        if (firstUser !== null) throw new TRPCError({ code: "UNAUTHORIZED" });

        const user = await tx.user.create({
          select: {
            ID: true,
          },
          data: {
            username,
            password: await hashPassword(password),
            permissions: "root",
          },
        });

        return user.ID;
      });
    }),
  auth: authRouter,
  hash: hashRouter,
  instance: instanceRouter,
  project: projectRouter,
  rule: ruleRouter,
  user: userRouter,
  wordlist: wordlistRouter,
  job: jobRouter,
});

export type AppRouter = typeof appRouter;
export type AppRouterInput = inferRouterInputs<AppRouter>;
export type AppRouterOutput = inferRouterOutputs<AppRouter>;
