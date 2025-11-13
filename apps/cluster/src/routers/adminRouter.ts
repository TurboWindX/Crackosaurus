import fs from "fs";
import path from "path";

import config from "../config";
import { publicProcedure, t } from "../plugins/trpc";

export const adminRouter = t.router({
  // Wipe EFS-like data directories (instances, wordlists, rules).
  // This is a destructive debugging endpoint intended for local/dev use only.
  wipeEfs: publicProcedure.mutation(async () => {
    const roots: string[] = [];
    const type = (config.type as Record<string, unknown>) ?? {};
    if (type.instanceRoot) roots.push(type.instanceRoot as string);
    if (type.wordlistRoot) roots.push(type.wordlistRoot as string);
    if (type.ruleRoot) roots.push(type.ruleRoot as string);

    const results: Record<string, number> = {};

    for (const root of roots) {
      let removed = 0;
      if (!fs.existsSync(root)) {
        results[root] = 0;
        continue;
      }

      try {
        for (const entry of fs.readdirSync(root)) {
          const p = path.join(root, entry);
          try {
            fs.rmSync(p, { recursive: true, force: true });
            removed++;
          } catch {
            // ignore per-entry errors
          }
        }
      } catch {
        // ignore
      }

      results[root] = removed;
    }

    return results;
  }),
});

export type AdminRouter = typeof adminRouter;
