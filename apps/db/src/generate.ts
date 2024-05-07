import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import config from "./config";

const PROVIDER_ROOT = "providers";

function main(): void {
  const providerPath = path.join(PROVIDER_ROOT, config.provider);
  if (!fs.existsSync(providerPath))
    throw ReferenceError(`Could not find provider at ${providerPath}`);

  const schemaPath = path.join(providerPath, "schema.prisma");

  const proc = childProcess.spawnSync(
    "prisma",
    ["generate", `--schema=${schemaPath}`],
    { encoding: "utf-8", stdio: "inherit" }
  );

  if ((proc.status ?? 1) !== 0) process.exit(1);
}

if (require.main === module) main();
