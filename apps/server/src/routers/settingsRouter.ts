import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";
import {
  MAX_INSTANCE_LIFE_HOURS_CEILING,
  getMaxInstanceLifeHours,
  setMaxInstanceLifeHours,
} from "../lib/settings";

// Cluster-wide runtime settings. Both procedures are gated on "root" — the same
// marker the web app uses for its most privileged pages (instance management) —
// so only an admin can read or change operational toggles like the max instance
// lifetime.
export const settingsRouter = t.router({
  get: permissionProcedure(["root"])
    .output(
      z.object({
        maxInstanceLifeHours: z.number().int(),
      })
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;
      return {
        maxInstanceLifeHours: await getMaxInstanceLifeHours(prisma),
      };
    }),
  setMaxInstanceLife: permissionProcedure(["root"])
    .input(
      z.object({
        // 0 disables the age-based reaper; positive values are hours. Capped at
        // the same ceiling the accessor enforces so the API and storage agree.
        hours: z.number().int().min(0).max(MAX_INSTANCE_LIFE_HOURS_CEILING),
      })
    )
    .output(
      z.object({
        maxInstanceLifeHours: z.number().int(),
      })
    )
    .mutation(async (opts) => {
      const { hours } = opts.input;
      const { prisma } = opts.ctx;

      await setMaxInstanceLifeHours(prisma, hours);

      // Re-read through the accessor so the client always reflects the
      // effective (validated) value, not the raw input.
      return {
        maxInstanceLifeHours: await getMaxInstanceLifeHours(prisma),
      };
    }),
});

export type SettingsRouter = typeof settingsRouter;
