import type { FastifyPluginCallback } from "fastify";
import fs from "fs";
import path from "path";
import type { WebSocket } from "ws";

interface JobSubscription {
  instanceID: string;
  jobID: string;
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

  fastify.get("/ws/job-status", { websocket: true }, (socket, req) => {
    // Require an authenticated session to use WebSocket
    if (!req.session?.uid) {
      console.log("[WebSocket] Rejected unauthenticated connection");
      socket.close(4401, "Unauthorized");
      return;
    }

    const clientSubscriptions = new Set<string>();
    subscriptions.set(socket, clientSubscriptions);

    console.log(
      `[WebSocket] Client connected to job-status (uid=${req.session.uid})`
    );

    // Handle subscription messages
    socket.on("message", (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === "subscribe") {
          const { instanceID, jobID } = message as JobSubscription & {
            type: string;
          };
          if (instanceID && jobID) {
            const subKey = `${instanceID}:${jobID}`;
            clientSubscriptions.add(subKey);
            console.log(`[WebSocket] Client subscribed to ${subKey}`);

            // Send immediate status update
            void sendStatusUpdate(socket, instanceID, jobID);
          }
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
              void sendStatusUpdate(socket, instanceID, jobID);
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

    if (!fs.existsSync(statusPath)) {
      // Status file doesn't exist yet - job may not have started
      console.log(`[WebSocket] Status file not found: ${statusPath}`);
      return;
    }

    console.log(`[WebSocket] Reading status from: ${statusPath}`);

    const statusFile = fs.readFileSync(statusPath, "utf-8");
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
      socket.send(JSON.stringify(message));
      return;
    }

    const message: StatusMessage = {
      type: "status",
      instanceID,
      jobID,
      data: status,
    };

    socket.send(JSON.stringify(message));
  } catch (error) {
    const errorMessage: StatusMessage = {
      type: "error",
      instanceID,
      jobID,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    socket.send(JSON.stringify(errorMessage));
  }
}
