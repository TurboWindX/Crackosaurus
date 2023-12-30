import Fastify from "fastify";
import cors from "@fastify/cors";

import { api } from "./api";

const fastify = Fastify();

fastify.register(api, { prefix: "api" });

fastify.register(cors, {
  origin: (origin, cb) => {
    const hostname = new URL(origin || "").hostname;

    if (hostname === "localhost") {
      cb(null, true);
    } else {
      cb(new Error("Not allowed"), false);
    }
  }
});

fastify.listen({ host: "0.0.0.0", port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`Running at ${address}`);
});
