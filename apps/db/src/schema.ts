import fs from "fs";
import path from "path";

import config from "./config";

const SCHEMA_ROOT = "schemas";
const PROVIDER_ROOT = "providers";
const COMMON_FILE = "common.prisma";

function main(): void {
  const COMMON_SCHEMA = fs.readFileSync(path.join(SCHEMA_ROOT, COMMON_FILE), {
    encoding: "utf-8",
  });

  const providerPath = path.join(PROVIDER_ROOT, config.provider);
  if (!fs.existsSync(providerPath))
    fs.mkdirSync(providerPath, { recursive: true });

  const schemaPath = path.join(SCHEMA_ROOT, `${config.provider}.prisma`);
  if (!fs.existsSync(schemaPath))
    throw ReferenceError(`Could not find schema at ${schemaPath}`);

  const schema = fs.readFileSync(schemaPath, { encoding: "utf-8" });

  const mergedSchema = `${schema}\n${COMMON_SCHEMA}`;

  const mergeSchemaPath = path.join(providerPath, "schema.prisma");
  fs.writeFileSync(mergeSchemaPath, mergedSchema);
}

if (require.main === module) main();
