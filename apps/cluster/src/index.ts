import Fastify from "fastify";

import api from "./api";
import { DebugCluster } from "./cluster/debug";

const fastify = Fastify();

const cluster = new DebugCluster(undefined);
fastify.register(api, { cluster });

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
