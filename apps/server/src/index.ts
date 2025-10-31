import { fastifyCookie } from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import { fastifySession } from "@fastify/session";
import fastifyStatic from "@fastify/static";
import {
  FastifyTRPCPluginOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import fs from "fs";
import path from "path";

import config from "./config";
import { clusterPlugin } from "./plugins/cluster/plugin";
import prismaPlugin from "./plugins/prisma";
import s3InitPlugin from "./plugins/s3Init";
import { createContext } from "./plugins/trpc/context";
import { AppRouter, appRouter } from "./routers";
import { upload } from "./upload";

const fastify = Fastify({
  maxParamLength: 5000,
});

fastify.get("/ping", {}, () => "pong");

fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  cookieName: "CrackID",
  secret: config.secret,
  cookie: {
    secure: false,
    maxAge: 3600000, // 1 hour in milliseconds
  },
});
fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 268_435_456_000,
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

fastify.register(s3InitPlugin);

fastify.register(clusterPlugin, {
  pollingRateMs: 1000,
});

const allowCORS = config.web.port !== config.host.port;
fastify.register(cors, {
  credentials: true,
  origin: (_origin, cb) => {
    cb(null, allowCORS);
  },
});

fastify.register(upload, {
  prefix: "upload",
  url: `http://${config.cluster.name}:${config.cluster.port}`,
});

fastify.register(fastifyTRPCPlugin, {
  prefix: "trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

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
