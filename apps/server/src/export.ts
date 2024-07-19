import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter as _AppRouter } from "./routers";

export type AppRouter = _AppRouter;
export type AppRouterInput = inferRouterInputs<AppRouter>;
export type AppRotuerOutput = inferRouterOutputs<AppRouter>;
