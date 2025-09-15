import fastifyMultipart from "@fastify/multipart";
import {
  FastifyTRPCPluginOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

import config from "./config";
import { clusterPlugin } from "./plugins/cluster";
import { createContext } from "./plugins/trpc/context";
import { AppRouter, appRouter } from "./routers";
import { upload } from "./upload";

const fastify = Fastify({
  // allow large raw uploads (e.g., > 2 GiB)
  bodyLimit: 5 * 1024 * 1024 * 1024,
});

fastify.get("/ping", {}, () => "pong");

// Accept raw octet-stream uploads as a stream
fastify.addContentTypeParser(
  "application/octet-stream",
  (_req, payload, done) => done(null, payload)
);

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 268_435_456_000,
  },
});

fastify.register(clusterPlugin, config.type);

fastify.register(upload, {
  prefix: "upload",
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
