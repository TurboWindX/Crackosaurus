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
    ["migrate", "dev", "--name=dev", `--schema=${schemaPath}`],
    { encoding: "utf-8" }
  );

  console.log(proc.stdout);
  console.error(proc.stderr);
}

if (require.main === module) main();
