import * as shared from "./shared";
import cors from "@fastify/cors";
import prismaPlugin from "./prisma";

import { api } from "./api";

const fastify = shared.fastify;

//Extend Session interface to include user
declare module "fastify" {
  interface Session {
    uid: number;
    username: string;
    authenticated: boolean;
    isAdmin: number;
    teams: Array<number>;
  }
}
//Fastify session management
fastify.register(shared.fastifyCookie);
fastify.register(shared.fastifySession, {
  cookieName: "CrackID",
  secret: "One Alex is good but two is better if you ask me.",
  cookie: {
    secure: false,
  },
});
fastify.register(prismaPlugin);

fastify.register(api, { prefix: "api" });

//Disabled CORS for easy debugging for now
/*
fastify.register(cors, {
  origin: (origin, cb) => {
    const hostname = new URL(origin || "").hostname;

    if (hostname === "localhost") {
      cb(null, true);
    } else {
      cb(new Error("Not allowed"), false);
    }
  }
});*/

//changed port to 8000 to debug with burp real quick
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
