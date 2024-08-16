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

  const migrateProc = childProcess.spawnSync(
    "prisma",
    [
      "migrate",
      "dev",
      `--schema=${schemaPath}`,
      "--create-only",
      "-n",
      "deploy",
    ],
    { encoding: "utf-8", stdio: "inherit" }
  );

  if ((migrateProc.status ?? 1) !== 0) process.exit(1);

  const deployProc = childProcess.spawnSync(
    "prisma",
    ["migrate", "deploy", `--schema=${schemaPath}`],
    { encoding: "utf-8", stdio: "inherit" }
  );

  if ((deployProc.status ?? 1) !== 0) process.exit(1);
}

if (require.main === module) main();
