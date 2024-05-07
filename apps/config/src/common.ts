import fs from "node:fs";
import path from "node:path";

import { APP_CONFIG, AppConfig, ProfileConfig } from "@repo/app-config";

export const ROOT_JSON_PATH = path.join(__dirname, "../../../config.json");
const PACKAGE_JSON_NAME = ".config.json";

const CONFIGS = ["cluster", "database", "backend", "web"] as const;
const PATHS = {
  cluster: path.join(__dirname, "../../cluster"),
  database: path.join(__dirname, "../../db"),
  backend: path.join(__dirname, "../../server"),
  web: path.join(__dirname, "../../web"),
} as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function loadConfig(path: string): AppConfig {
  const configFile = fs.readFileSync(path, { encoding: "utf-8" });

  let configJSON;
  try {
    configJSON = JSON.parse(configFile);
  } catch {
    throw new ConfigError("Config file is not valid JSON");
  }

  const configRes = APP_CONFIG.safeParse(configJSON);

  if (configRes.error)
    throw new ConfigError(`Config file is not valid: ${configRes.error}`);

  return configRes.data;
}

function writeTargetConfig(dir: string, config: any): void {
  if (!fs.existsSync(dir))
    throw new ConfigError(`Subconfig folder not found: ${dir}`);

  const configPath = path.join(dir, PACKAGE_JSON_NAME);
  fs.writeFileSync(configPath, JSON.stringify(config, undefined, 2));
}

export function writeProfileConfig(config: ProfileConfig): void {
  CONFIGS.forEach((name) => {
    const path = PATHS[name];

    if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });

    writeTargetConfig(path, config[name]);
  });
}
