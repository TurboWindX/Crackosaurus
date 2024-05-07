import fs from "node:fs";

import {
  ConfigError,
  ROOT_JSON_PATH,
  loadConfig,
  writeProfileConfig,
} from "./common";

async function mainThrow(): Promise<void> {
  if (!fs.existsSync(ROOT_JSON_PATH))
    throw new ConfigError("Configuration not found");
  const config = loadConfig(ROOT_JSON_PATH);

  const profileName = process.argv[process.argv.length - 1];

  const profile = config.profiles.find(
    (profile) => profile.name === profileName
  );
  if (profile === undefined)
    throw new ConfigError("Configuration profile not found");

  writeProfileConfig(profile);
}

async function main(): Promise<void> {
  try {
    await mainThrow();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);

      process.exit(1);
    } else {
      throw e;
    }
  }
}

if (require.main === module) main();
