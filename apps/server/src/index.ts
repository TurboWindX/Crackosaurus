import { fastifyCookie } from "@fastify/cookie";
import cors from "@fastify/cors";
import { fastifySession } from "@fastify/session";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";

import { api } from "./api";
import config from "./config";
import { clusterPlugin } from "./plugins/cluster/plugin";
import prismaPlugin from "./plugins/prisma";

const fastify = Fastify();

fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  cookieName: "CrackID",
  secret: config.secret,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60,
  },
});

const staticFolder = path.resolve("public");
if (fs.existsSync(staticFolder)) {
  fastify.register(fastifyStatic, { root: staticFolder });

  fastify.setNotFoundHandler({}, (_request, reply) => {
    reply.status(200).type("text/html");

    return reply.sendFile("index.html");
  });
}

fastify.register(prismaPlugin);

fastify.register(clusterPlugin, {
  http: {
    url: `http://${config.cluster.name}:${config.cluster.port}`,
  },
  pollingRateMs: 1000,
});

fastify.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (origin === undefined) {
      cb(null, true);
      return;
    }

    const hostname = new URL(origin).hostname;

    if (hostname !== config.web.name) {
      cb(new Error("Not allowed"), false);
      return;
    }

    cb(null, true);
  },
});

fastify.register(api, { prefix: "api" });

fastify.listen(
  {
    host: "0.0.0.0",
    port: config.host.port,
  },
  (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(`Running at ${address}`);
  }
);
