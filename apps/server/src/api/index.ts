import type { FastifyPluginCallback } from "fastify";

export const api: FastifyPluginCallback<{}> = (instance, opts, next) => {
  instance.get("/ping", () => "pong");
  
  next();
};
