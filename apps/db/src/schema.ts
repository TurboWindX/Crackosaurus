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

  // Read provider-specific configuration (generator and datasource)
  const providerConfig = fs.readFileSync(schemaPath, { encoding: "utf-8" });

  // Create the final schema with provider config first, then common models
  const mergedSchema = `${providerConfig}\n\n// Common models\n${COMMON_SCHEMA}`;

  // Write the merged schema to the provider directory
  const mergeSchemaPath = path.join(providerPath, "schema.prisma");
  fs.writeFileSync(mergeSchemaPath, mergedSchema);
}

if (require.main === module) main();
