import kleur from "kleur";
import crypto from "node:crypto";
import fs from "node:fs";
import prompts from "prompts";

import {
  APP_CONFIG,
  AppConfig,
  BACKEND_CONFIG,
  BACKEND_DEFAULT_PORT,
  BackendConfig,
  CLUSTER_CONFIG,
  CLUSTER_DEFAULT_PORT,
  CLUSTER_TYPES,
  ClusterConfig,
  ClusterType,
  DATABASE_CONFIG,
  DATABASE_PROVIDERS,
  DatabaseConfig,
  DatabaseProvider,
  PROFILE_CONFIG,
  ProfileConfig,
  WEB_CONFIG,
  WEB_DEFAULT_PORT,
  WebConfig,
} from "@repo/app-config";

import {
  ConfigError,
  ROOT_JSON_PATH,
  loadConfig,
  writeProfileConfig,
} from "./common";

type PromptResponseValue<T extends prompts.PromptObject<"value">> =
  T["type"] extends "text" ? string : T["type"] extends "number" ? number : any;

async function ask<T extends prompts.PromptObject<"value">>(
  question: T
): Promise<PromptResponseValue<T>> {
  const res = await prompts(question);
  if (res.value === undefined) process.exit(1);

  return res.value;
}

async function selectProfile(
  profiles: ProfileConfig[]
): Promise<ProfileConfig> {
  return await ask({
    name: "value",
    message: "Select configuration profile",
    type: "select",
    choices: profiles.map((profile) => ({
      title: profile.name,
      value: profile,
    })),
  });
}

function getDatabasePathDefault(provider: DatabaseProvider): string {
  switch (provider) {
    case "postgresql":
      return "postgresql://user:pass@localhost";
    case "sqlite":
      return "file:./db.sqlite";
    default:
      throw new ConfigError(`Unhandled database provider ${provider}`);
  }
}

async function createDatabase(): Promise<DatabaseConfig> {
  while (true) {
    const provider = await ask({
      name: "value",
      message: "Database provider",
      type: "select",
      choices: DATABASE_PROVIDERS.map((provider) => ({
        title: provider,
        value: provider,
      })),
    });

    const path = await ask({
      name: "value",
      message: "Database path",
      type: "text",
      initial: getDatabasePathDefault(provider),
    });

    const res = DATABASE_CONFIG.safeParse({
      provider,
      path,
    });

    if (res.error) {
      console.error(`Database config is invalid: ${res.error}`);
      continue;
    }

    return res.data;
  }
}

async function createClusterType(
  name: ClusterType
): Promise<ClusterConfig["type"]> {
  switch (name) {
    case "debug":
      return { name };
    default:
      throw new ConfigError(`Unhandled cluster type: ${name}`);
  }
}

async function createCluster(): Promise<ClusterConfig> {
  while (true) {
    const domain = await ask({
      name: "value",
      message: "Cluster domain",
      type: "text",
      initial: "localhost",
    });

    const port = await ask({
      name: "value",
      message: "Cluster port",
      type: "number",
      min: 0,
      max: 65535,
      initial: CLUSTER_DEFAULT_PORT,
    });

    const name = await ask({
      name: "value",
      message: "Cluster type",
      type: "select",
      choices: CLUSTER_TYPES.map((type) => ({
        title: type,
        value: type,
      })),
    });

    const type = await createClusterType(name);

    const res = CLUSTER_CONFIG.safeParse({
      host: {
        name: domain,
        port,
      },
      type,
    });

    if (res.error) {
      console.error(`Cluster config is invalid: ${res.error}`);
      continue;
    }

    return res.data;
  }
}

function createSecret(): string {
  return crypto.randomBytes(64).toString("hex");
}

async function createBackend(): Promise<BackendConfig> {
  const secret = createSecret();

  while (true) {
    const domain = await ask({
      name: "value",
      message: "Backend domain",
      type: "text",
      initial: "localhost",
    });

    const port = await ask({
      name: "value",
      message: "Backend port",
      type: "number",
      min: 0,
      max: 65535,
      initial: BACKEND_DEFAULT_PORT,
    });

    const res = BACKEND_CONFIG.safeParse({
      host: {
        name: domain,
        port,
      },
      secret,
      web: {
        name: "localhost",
        port: WEB_DEFAULT_PORT,
      },
      cluster: {
        name: "localhost",
        port: CLUSTER_DEFAULT_PORT,
      },
    });

    if (res.error) {
      console.error(`Backend config is invalid: ${res.error}`);
      continue;
    }

    return res.data;
  }
}

async function createWeb(): Promise<WebConfig> {
  while (true) {
    const domain = await ask({
      name: "value",
      message: "Web domain",
      type: "text",
      initial: "localhost",
    });

    const port = await ask({
      name: "value",
      message: "Web port",
      type: "number",
      min: 0,
      max: 65535,
      initial: WEB_DEFAULT_PORT,
    });

    const res = WEB_CONFIG.safeParse({
      host: {
        name: domain,
        port,
      },
      backend: {
        name: "localhost",
        port: BACKEND_DEFAULT_PORT,
      },
    });

    if (res.error) {
      console.error(`Web config is invalid: ${res.error}`);
      continue;
    }

    return res.data;
  }
}

async function createProfile(): Promise<ProfileConfig> {
  const name = await ask({
    name: "value",
    message: "Profile name",
    type: "text",
  });

  console.log();

  const database = await createDatabase();
  console.log();

  const cluster = await createCluster();
  console.log();

  const backend = await createBackend();
  console.log();

  const web = await createWeb();
  console.log();

  backend.cluster = cluster.host;
  backend.web = web.host;

  web.backend = backend.host;

  const res = PROFILE_CONFIG.safeParse({
    name,
    database,
    cluster,
    backend,
    web,
  });

  if (res.error)
    throw new ConfigError(`Profile config is invalid: ${res.error}`);

  return res.data;
}

async function createConfig(): Promise<AppConfig> {
  const profiles: ProfileConfig[] = [];
  while (true) {
    const profile = await createProfile();
    profiles.push(profile);

    const ok = await prompts({
      name: "value",
      message: "Add more profiles?",
      type: "confirm",
    });

    console.log();
    if (ok.value !== true) break;
  }

  const res = APP_CONFIG.safeParse({ profiles });

  if (res.error) throw new ConfigError(`Config is not valid: ${res.error}`);

  return res.data;
}

function printSplash(): void {
  console.log(kleur.bold(kleur.red("Crackosaurus")) + "\n");
}

async function mainThrow(): Promise<void> {
  printSplash();

  if (!fs.existsSync(ROOT_JSON_PATH)) {
    fs.writeFileSync(
      ROOT_JSON_PATH,
      JSON.stringify(await createConfig(), undefined, 2)
    );
  }

  const config = loadConfig(ROOT_JSON_PATH);

  if (config.profiles.length === 0)
    throw new ConfigError("Config file has no valid profile");
  const profile = await selectProfile(config.profiles);

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
