import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginCallback } from "fastify";
import fs from "fs";
import path from "path";
import type { WebSocket } from "ws";

import { hasPermission } from "@repo/api";

interface JobSubscription {
  instanceID: string;
  jobID: string;
}

/**
 * Authorize a session to subscribe to a job's live status.
 *
 * Two guards, both enforced against live DB state:
 *  1. Permissions are resolved from the DB by uid on every subscribe, not from
 *     the login-time session snapshot, so revocation/demotion/deletion takes
 *     effect immediately.
 *  2. The client-supplied instanceID must match the job's actually-assigned
 *     instance tag. Otherwise a caller authorized for one job could stream (and
 *     path-probe) arbitrary instanceIDs — the status file path is
 *     instances/<instanceID>/jobs/<jobID>/status.json (IDOR on the path).
 *
 * Authorization itself mirrors jobRouter access: a caller with
 * `instances:jobs:get` (or root/`*`) may view any job; otherwise they must be
 * the job submitter or a member of a project the job's hashes belong to.
 */
async function authorizeSubscription(
  prisma: PrismaClient,
  instanceID: string,
  jobID: string,
  uid: string
): Promise<boolean> {
  // (1) Live permission lookup — never trust the session snapshot.
  const user = await prisma.user.findUnique({
    select: { permissions: true },
    where: { ID: uid },
  });
  if (!user) return false;
  const permissions = user.permissions;

  // (2) Bind instanceID to the job's assigned instance tag. A job with no
  // assigned instance has no status file to stream, so reject it too.
  const job = await prisma.job.findUnique({
    where: { JID: jobID },
    select: { instance: { select: { tag: true } } },
  });
  if (!job || !job.instance || job.instance.tag !== instanceID) return false;

  if (
    hasPermission(permissions, "instances:jobs:get") ||
    hasPermission(permissions, "root")
  )
    return true;

  const owned = await prisma.job.findFirst({
    where: {
      JID: jobID,
      OR: [
        { submittedById: uid },
        { hashes: { some: { project: { members: { some: { ID: uid } } } } } },
      ],
    },
    select: { JID: true },
  });

  return owned !== null;
}

interface StatusMessage {
  type: "status" | "error" | "complete";
  instanceID: string;
  jobID: string;
  data?: unknown;
  error?: string;
}

/**
 * WebSocket plugin for real-time job status updates
 *
 * Clients connect to /ws/job-status and send subscription messages:
 * { type: "subscribe", instanceID: "gpu-123", jobID: "job-456" }
 *
 * Server broadcasts status updates every 2 seconds while job is running
 */
export const jobStatusWebSocket: FastifyPluginCallback = (
  fastify,
  _opts,
  done
) => {
  // Track active subscriptions per connection (use Map instead of WeakMap for iteration)
  const subscriptions = new Map<WebSocket, Set<string>>();

  // Polling interval for status updates
  const POLL_INTERVAL = 2000; // 2 seconds
  let pollTimer: NodeJS.Timeout | null = null;

  // Cap subscriptions per connection so a client cannot grow the Set (and thus
  // the per-tick synchronous FS reads) without bound.
  const MAX_SUBSCRIPTIONS_PER_CLIENT = 50;
  // Reject malformed IDs at subscribe time so junk keys never enter the Set.
  const ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

  fastify.get("/ws/job-status", { websocket: true }, (socket, req) => {
    // Require an authenticated session to use WebSocket
    if (!req.session?.uid) {
      console.log("[WebSocket] Rejected unauthenticated connection");
      socket.close(4401, "Unauthorized");
      return;
    }

    const uid = req.session.uid;
    const prisma = req.server.prisma;

    const clientSubscriptions = new Set<string>();
    subscriptions.set(socket, clientSubscriptions);

    // Slots reserved by subscribe frames whose async authorization is still in
    // flight. Counted against the cap synchronously (before the await) so a
    // client can't pipeline many frames past the size check while the DB
    // lookups resolve — otherwise every in-flight handler sees size ~0 and they
    // all add, blowing past MAX_SUBSCRIPTIONS_PER_CLIENT (TOCTOU).
    let pendingSubscriptions = 0;

    console.log(
      `[WebSocket] Client connected to job-status (uid=${uid})`
    );

    // Handle subscription messages
    socket.on("message", (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === "subscribe") {
          const { instanceID, jobID } = message as JobSubscription & {
            type: string;
          };
          // Validate format before doing anything else, and cap the number of
          // subscriptions so a client can't grow the poll loop's per-tick work
          // without bound.
          if (
            !instanceID ||
            !jobID ||
            !ID_PATTERN.test(instanceID) ||
            !ID_PATTERN.test(jobID)
          ) {
            return;
          }
          // Reserve a slot synchronously — counting both live subscriptions and
          // in-flight (still-authorizing) ones — so a burst of frames can't all
          // pass the check before any of them adds. Released in finally.
          if (
            clientSubscriptions.size + pendingSubscriptions >=
            MAX_SUBSCRIPTIONS_PER_CLIENT
          ) {
            console.warn(
              `[WebSocket] uid=${uid} exceeded subscription cap (${MAX_SUBSCRIPTIONS_PER_CLIENT})`
            );
            return;
          }
          pendingSubscriptions++;
          // Authorize BEFORE adding the subscription, so the poll loop never
          // streams a job the caller isn't allowed to see.
          void authorizeSubscription(prisma, instanceID, jobID, uid)
            .then((allowed) => {
              if (!allowed) {
                console.warn(
                  `[WebSocket] uid=${uid} denied subscription to ${instanceID}:${jobID}`
                );
                return;
              }
              const subKey = `${instanceID}:${jobID}`;
              clientSubscriptions.add(subKey);
              console.log(`[WebSocket] Client subscribed to ${subKey}`);

              // Send immediate status update
              void sendStatusUpdate(socket, instanceID, jobID);
            })
            .catch((err) => {
              console.error("[WebSocket] authorizeSubscription failed:", err);
            })
            .finally(() => {
              pendingSubscriptions--;
            });
        } else if (message.type === "unsubscribe") {
          const { instanceID, jobID } = message as JobSubscription & {
            type: string;
          };
          if (instanceID && jobID) {
            const subKey = `${instanceID}:${jobID}`;
            clientSubscriptions.delete(subKey);
            console.log(`[WebSocket] Client unsubscribed from ${subKey}`);
          }
        }
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    });

    socket.on("close", () => {
      console.log("[WebSocket] Client disconnected");
      subscriptions.delete(socket);
    });

    socket.on("error", (error: Error) => {
      console.error("[WebSocket] Socket error:", error);
    });
  });

  // Start polling timer if not already running
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      // Broadcast status updates to all subscribed clients
      for (const [socket, subs] of subscriptions) {
        if (socket.readyState === socket.OPEN) {
          for (const subKey of subs) {
            const [instanceID, jobID] = subKey.split(":");
            if (instanceID && jobID) {
              void sendStatusUpdate(socket, instanceID, jobID).catch((err) => {
                console.error("[WebSocket] sendStatusUpdate failed:", err);
              });
            }
          }
        }
      }
    }, POLL_INTERVAL);

    console.log(`[WebSocket] Started polling timer (${POLL_INTERVAL}ms)`);
  }

  // Clean up timer on server shutdown
  fastify.addHook("onClose", (_instance, done) => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      console.log("[WebSocket] Stopped polling timer");
    }
    done();
  });

  done();
};

/**
 * Read status file from EFS and send to client
 */
async function sendStatusUpdate(
  socket: WebSocket,
  instanceID: string,
  jobID: string
): Promise<void> {
  try {
    // Validate instanceID and jobID to prevent path traversal
    const idPattern = /^[a-zA-Z0-9._-]+$/;
    if (!idPattern.test(instanceID) || !idPattern.test(jobID)) {
      console.error(
        `[WebSocket] Invalid instanceID or jobID: ${instanceID}, ${jobID}`
      );
      return;
    }

    const instanceRoot = process.env.INSTANCE_ROOT || "/crackodata/instances";
    const statusPath = path.join(
      instanceRoot,
      instanceID,
      "jobs",
      jobID,
      "status.json"
    );

    // Verify the resolved path is within the instance root
    const resolved = path.resolve(statusPath);
    const root = path.resolve(instanceRoot);
    if (!resolved.startsWith(root + path.sep)) {
      console.error(`[WebSocket] Path traversal blocked: ${statusPath}`);
      return;
    }

    // Read the status file asynchronously. This runs in the shared 2s poll
    // timer across every socket × subscription, so a synchronous read here
    // (fs.readFileSync / existsSync) would block the event loop for all users.
    let statusFile: string;
    try {
      statusFile = await fs.promises.readFile(statusPath, "utf-8");
    } catch (err) {
      // Status file doesn't exist yet — job may not have started. Treat ENOENT
      // as a non-event; surface anything else.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    const status = JSON.parse(statusFile);

    // Check if job is complete
    if (status.statusCode === 5 || status.statusCode === 6) {
      // 5 = Exhausted, 6 = Cracked
      const message: StatusMessage = {
        type: "complete",
        instanceID,
        jobID,
        data: status,
      };
      sendIfOpen(socket, message);
      return;
    }

    const message: StatusMessage = {
      type: "status",
      instanceID,
      jobID,
      data: status,
    };

    sendIfOpen(socket, message);
  } catch (error) {
    const errorMessage: StatusMessage = {
      type: "error",
      instanceID,
      jobID,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    sendIfOpen(socket, errorMessage);
  }
}

/**
 * Send a message only if the socket is open. Guards against `ws` throwing
 * synchronously when the socket is CONNECTING/CLOSED, which would otherwise
 * reject the enclosing promise (and, without a .catch, crash the process).
 */
function sendIfOpen(socket: WebSocket, message: StatusMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(message));
  } catch (err) {
    console.error("[WebSocket] socket.send failed:", err);
  }
}
