import { publicProcedure, t } from "../plugins/trpc";
import { adminRouter } from "./adminRouter";
import { infoRouter } from "./infoRouter";
import { instanceRouter } from "./instanceRouter";
import { wordlistRouter } from "./wordlistRouter";

export const appRouter = t.router({
  ping: publicProcedure.query(() => "pong"),
  info: infoRouter,
  instance: instanceRouter,
  wordlist: wordlistRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
