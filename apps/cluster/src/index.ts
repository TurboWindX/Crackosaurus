import fastifyMultipart from "@fastify/multipart";
import Fastify from "fastify";

import api from "./api";
import config from "./config";
import { clusterPlugin } from "./plugins/cluster";

const fastify = Fastify();

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 4_194_304_000,
  },
});

fastify.register(clusterPlugin, config.type);

fastify.register(api);

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
