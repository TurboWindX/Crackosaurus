import { publicProcedure, t } from "../plugins/trpc";
import { infoRouter } from "./infoRouter";
import { instanceRouter } from "./instanceRouter";
import { wordlistRouter } from "./wordlistRouter";

export const appRouter = t.router({
  ping: publicProcedure.query(() => "pong"),
  info: infoRouter,
  instance: instanceRouter,
  wordlist: wordlistRouter,
});

export type AppRouter = typeof appRouter;
