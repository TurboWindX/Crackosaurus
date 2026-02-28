import fastifyMultipart from "@fastify/multipart";
import {
  FastifyTRPCPluginOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import fs from "fs";

import config from "./config";
import { clusterPlugin } from "./plugins/cluster";
import { createContext } from "./plugins/trpc/context";
import { AppRouter, appRouter } from "./routers";
import { upload } from "./upload";

// Log mount information on startup to debug EFS mount issues
console.log("[Cluster] Starting cluster service...");
try {
  if (fs.existsSync("/proc/mounts")) {
    const mounts = fs.readFileSync("/proc/mounts", "utf8");
    console.log("[Cluster] /proc/mounts contents (EFS/NFS mounts only):");
    mounts.split("\n").forEach((line) => {
      if (
        line.includes("crackodata") ||
        line.includes("efs") ||
        line.includes("nfs")
      ) {
        console.log(`  ${line}`);
      }
    });
    const hasCrackodataMount = mounts.includes("/crackodata");
    if (!hasCrackodataMount) {
      console.error(
        "[Cluster] WARNING: No /crackodata mount found! EFS is not mounted!"
      );
      console.error(
        "[Cluster] This will cause instance folders to be created in container-local storage."
      );
    } else {
      console.log("[Cluster] ✓ /crackodata is mounted");
    }
  }
} catch (e) {
  console.error("[Cluster] Failed to read /proc/mounts:", e);
}

const fastify = Fastify({
  // allow large raw uploads (e.g., > 2 GiB)
  bodyLimit: 5 * 1024 * 1024 * 1024,
});

// ── Shared-secret authentication ──────────────────────────────────────────
// When CLUSTER_SECRET is configured, every incoming request (except /ping)
// must include a matching `Authorization: Bearer <secret>` header.
const clusterSecret = config.secret;
if (clusterSecret) {
  console.log("[Cluster] Shared-secret authentication ENABLED");
  fastify.addHook("onRequest", async (request, reply) => {
    // Allow health-check probes through unauthenticated
    if (request.url === "/ping") return;

    const authHeader = request.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${clusterSecret}`) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });
} else {
  console.warn(
    "[Cluster] \u26a0  WARNING: No CLUSTER_SECRET set \u2014 all endpoints are unauthenticated!"
  );
  console.warn(
    "[Cluster]   Set CLUSTER_SECRET on both the server and cluster to enable authentication."
  );
}

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
