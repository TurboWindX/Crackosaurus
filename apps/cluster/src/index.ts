import Fastify from "fastify";

import api from "./api";
import { clusterPlugin } from "./plugins/cluster";

const fastify = Fastify();

fastify.register(clusterPlugin, {
  debug: true,
});

fastify.register(api);

fastify.listen(
  {
    host: "0.0.0.0",
    port: 8001,
  },
  (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(`Running at ${address}`);
  }
);
