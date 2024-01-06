import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifySession } from "@fastify/session";
import { fastifyCookie } from "@fastify/cookie";
import prismaPlugin from "./prisma";
import fs from "node:fs";

import { api } from "./api";

const fastify = Fastify({
  // https: {
  //   key: fs.readFileSync("dev.key"),
  //   cert: fs.readFileSync("dev.crt")
  // }
});

//Fastify session management
fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  cookieName: "CrackID",
  secret: "One Alex is good but two is better if you ask me.",
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60,
  },
});

fastify.register(prismaPlugin);

fastify.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (origin === undefined) {
      cb(null, true);
      return;
    }

    const hostname = new URL(origin).hostname;

    // TODO: Config for frontend website.
    if (hostname !== "localhost") {
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
    port: 8000,
  },
  (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(`Running at ${address}`);
  }
);
