import type { Prisma } from "@prisma/client";
import { TRPCError, inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, t } from "../plugins/trpc";
import { authRouter, hashPassword } from "./authRouter";
import { cascadeRouter } from "./cascadeRouter";
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
        username: z
          .string()
          .min(1, "Username is required")
          .max(255, "Username must be at most 255 characters")
          .regex(
            /^[a-zA-Z0-9._@-]+$/,
            "Username may only contain letters, numbers, dots, hyphens, underscores, and @"
          ),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(1024, "Password must be at most 1024 characters"),
      })
    )
    .output(z.string())
    .mutation(async (opts) => {
      const { username, password } = opts.input;
      const { prisma } = opts.ctx;

      // Use a serializable transaction to prevent race conditions where two
      // concurrent callers both see an empty user table and both create root accounts.
      return await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
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
        },
        {
          isolationLevel: "Serializable",
        }
      );
    }),
  auth: authRouter,
  cascade: cascadeRouter,
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
