import { type FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import { LocalInstanceAPI, type LocalInstanceAPIConfig } from "./local";
import { AWSInstanceAPI } from "./aws";
import { DebugInstanceAPI } from "./debug";

export interface InstanceAPIProviders {
  aws?: AWSInstanceAPI
  debug?: DebugInstanceAPI
  local?: LocalInstanceAPI
}

declare module "fastify" {
  interface FastifyInstance {
    instances: InstanceAPIProviders
  }
}

export interface InstancePluginConfig extends FastifyPluginOptions {
  debug?: boolean;
  local?: LocalInstanceAPIConfig;
}

const instancePlugin = fp<InstancePluginConfig>(async (server, options) => {
  const instances: InstanceAPIProviders = {};

  if (options.debug) {
    const instanceAPI = new DebugInstanceAPI(undefined);
    
    if (await instanceAPI.load()) instances.debug = instanceAPI; 
  }

  if (options.local) {
    const instanceAPI = new LocalInstanceAPI(options.local);
    
    if (await instanceAPI.load()) instances.local = instanceAPI; 
  }

  server.decorate("instances", instances);
});

export default instancePlugin;
