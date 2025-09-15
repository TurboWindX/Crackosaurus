import childProcess from "child_process";
import fs from "fs";
import path from "path";

import config from "./config";

const PROVIDER_ROOT = "providers";

function main(): void {
  const providerPath = path.join(PROVIDER_ROOT, config.provider);
  if (!fs.existsSync(providerPath))
    throw ReferenceError(`Could not find provider at ${providerPath}`);

  const schemaPath = path.join(providerPath, "schema.prisma");

  childProcess.spawnSync(
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

  childProcess.spawnSync(
    "prisma",
    ["migrate", "deploy", `--schema=${schemaPath}`],
    { encoding: "utf-8", stdio: "inherit" }
  );

  // Always ensure the DB schema exists (covers fresh DBs or empty migrations)
  const pushProc = childProcess.spawnSync(
    "prisma",
    ["db", "push", `--schema=${schemaPath}`, "--accept-data-loss"],
    { encoding: "utf-8", stdio: "inherit" }
  );

  if ((pushProc.status ?? 1) !== 0) process.exit(1);
}

if (require.main === module) main();
