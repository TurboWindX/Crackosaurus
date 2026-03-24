import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { fastifyCookie } from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import { fastifySession } from "@fastify/session";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  FastifyTRPCPluginOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import fs from "fs";
import path from "path";

import config from "./config";
import { clusterPlugin } from "./plugins/cluster/plugin";
import { jobStatusWebSocket } from "./plugins/jobStatusWebSocket";
import { orchestratorPlugin } from "./plugins/orchestrator/plugin";
import prismaPlugin from "./plugins/prisma";
import s3InitPlugin from "./plugins/s3Init";
import { createContext } from "./plugins/trpc/context";
import { AppRouter, appRouter } from "./routers";
import { upload } from "./upload";

const fastify = Fastify({
  maxParamLength: 5000,
  // Trust the X-Forwarded-Proto header from the ALB so that req.protocol
  // returns "https" when TLS is terminated at the load balancer. This is
  // required for @fastify/session to correctly set/read Secure cookies.
  trustProxy: true,
});

fastify.get("/ping", {}, () => "pong");

fastify.register(fastifyCookie);
fastify.register(websocket);
// COOKIE_SECURE overrides the default. In production the cookie should be Secure
// when the ALB terminates TLS, but the current ALB is HTTP-only so we default
// to false in production unless explicitly opted in via COOKIE_SECURE=true.
const cookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  process.env.COOKIE_SECURE === "1" ||
  false;

fastify.register(fastifySession, {
  cookieName: "CrackID",
  secret: config.secret,
  cookie: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite: "lax",
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
  pollingRateMs: 5000, // Poll every 5s instead of 1s to reduce memory pressure
});

fastify.register(orchestratorPlugin, {
  pollingRateMs: 10000, // Check for approved jobs every 10s (reduced to avoid spam when cluster unreachable)
  maxConcurrent: 5, // Process up to 5 jobs in parallel
});

fastify.register(jobStatusWebSocket);

const allowCORS = config.web.port !== config.host.port;
fastify.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (!allowCORS) return cb(null, false);
    // In production, only allow the configured web origin
    if (config.environment === "production") {
      const allowedOrigin = `https://${config.web.name}`;
      cb(null, origin === allowedOrigin ? allowedOrigin : false);
    } else {
      // In development, allow any localhost origin
      if (
        !origin ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        cb(null, origin || true);
      } else {
        cb(null, false);
      }
    }
  },
});

// Resolve cluster URL: prefer explicit CLUSTER_HOST, then Cloud Map discovery env vars,
// then fallback to configured value from `config` (which itself falls back to localhost).
const clusterUrl: string = (() => {
  const envHost = process.env.CLUSTER_HOST;
  const discoveryService = process.env.CLUSTER_DISCOVERY_SERVICE;
  const discoveryNamespace = process.env.CLUSTER_DISCOVERY_NAMESPACE;
  const envPort = process.env.CLUSTER_PORT;

  let host: string;
  if (envHost && envHost !== "0.0.0.0") {
    host = envHost;
  } else if (discoveryService && discoveryNamespace) {
    // Use private DNS name provided by Cloud Map (service.namespace)
    host = `${discoveryService}.${discoveryNamespace}`;
  } else {
    host = config.cluster.name;
  }

  const port = envPort ?? String(config.cluster.port);
  const url = `http://${host}:${port}`;

  console.info("[startup] resolved cluster url", {
    host,
    port,
    url,
    envHost: envHost ?? null,
    discoveryService: discoveryService ?? null,
    discoveryNamespace: discoveryNamespace ?? null,
  });

  return url;
})();

fastify.register(upload, {
  prefix: "upload",
  url: clusterUrl,
});

fastify.register(fastifyTRPCPlugin, {
  prefix: "trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

(async () => {
  // If DATABASE_SECRET_ARN is set, read the secret and set DATABASE_PATH
  if (process.env.DATABASE_SECRET_ARN) {
    console.log(
      "[entrypoint] Reading database credentials from Secrets Manager..."
    );
    const secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || "ca-central-1",
    });
    const command = new GetSecretValueCommand({
      SecretId: process.env.DATABASE_SECRET_ARN,
    });
    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString!);
    const password = secret.password;
    const username = secret.username;
    const host = process.env.DATABASE_HOST;
    const port = process.env.DATABASE_PORT || "5432";
    const dbName = process.env.DATABASE_NAME || "crackosaurus";
    process.env.DATABASE_PATH = `postgresql://${username}:${password}@${host}:${port}/${dbName}?schema=public`;
    process.env.DATABASE_URL = `postgresql://${username}:${password}@${host}:${port}/${dbName}?schema=public`;
    console.log(
      "[entrypoint] Database credentials loaded and DATABASE_PATH set"
    );
  }

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
})();
