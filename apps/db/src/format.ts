import childProcess from "child_process";
import fs from "fs";
import path from "path";

const SCHEMA_ROOT = "schemas";

function main(): void {
  fs.readdirSync(SCHEMA_ROOT)
    .filter((fileName) => fileName.endsWith(".prisma"))
    .forEach((fileName) => {
      const schemaPath = path.join(SCHEMA_ROOT, fileName);

      const proc = childProcess.spawnSync(
        "prisma",
        ["format", `--schema=${schemaPath}`],
        { encoding: "utf-8" }
      );

      console.log(proc.stdout);
      console.error(proc.stderr);
    });
}

if (require.main === module) main();
