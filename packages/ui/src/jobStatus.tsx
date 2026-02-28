import { Activity, Clock, Cpu, Gauge, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/shadcn/components/ui/card";

// Simple progress bar component
const Progress = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => (
  <div
    className={`w-full overflow-hidden rounded-full bg-secondary ${className || "h-2"}`}
  >
    <div
      className="h-full bg-primary transition-all duration-500"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

interface JobStatus {
  timestamp: number;
  sessionName: string;
  statusCode: number;
  statusText: string;
  target: string;
  progress: [number, number];
  progressPercent: number;
  restorePoint: number;
  recovered: [number, number];
  rejected: number;
  speed: number;
  speedFormatted: string;
  execRuntime: number;
  estimatedStop: number;
  eta: string;
  instanceId: string;
  instanceType: string;
  jobId: string;
}

interface JobStatusDisplayProps {
  instanceID: string;
  jobID: string;
  serverUrl: string; // e.g., "http://localhost:8080"
}

export const JobStatusDisplay = ({
  instanceID,
  jobID,
  serverUrl,
}: JobStatusDisplayProps) => {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Convert http(s) to ws(s) for WebSocket connection
    const wsUrl = serverUrl.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsUrl}/ws/job-status`);

    socket.onopen = () => {
      console.log("[JobStatus] WebSocket connected");
      setIsConnected(true);
      setError(null);

      // Subscribe to job status updates
      socket.send(
        JSON.stringify({
          type: "subscribe",
          instanceID,
          jobID,
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "status" || message.type === "complete") {
          setStatus(message.data);
          setError(null);
        } else if (message.type === "error") {
          setError(message.error);
        }
      } catch (err) {
        console.error("[JobStatus] Failed to parse message:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("[JobStatus] WebSocket error:", err);
      setError("Connection error");
      setIsConnected(false);
    };

    socket.onclose = () => {
      console.log("[JobStatus] WebSocket disconnected");
      setIsConnected(false);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        // Unsubscribe before closing
        socket.send(
          JSON.stringify({
            type: "unsubscribe",
            instanceID,
            jobID,
          })
        );
      }
      socket.close();
    };
  }, [instanceID, jobID, serverUrl]);

  if (error) {
    return (
      <Card className="border-yellow-500">
        <CardHeader>
          <CardTitle className="text-yellow-600">Status Unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error === "Connection error"
              ? "Unable to connect to status updates. Job may not be running yet."
              : error}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Waiting for Status Updates...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? "Connected. Waiting for job to start..."
              : "Connecting to status service..."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const isRunning = status.statusCode === 3; // 3 = Running
  const isComplete = status.statusCode === 5 || status.statusCode === 6; // 5 = Exhausted, 6 = Cracked

  return (
    <div className="grid gap-4">
      {/* Main Progress Card */}
      <Card className={isComplete ? "border-green-500" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isRunning && (
                <Activity className="h-5 w-5 animate-pulse text-green-500" />
              )}
              {isComplete && <span className="text-green-600">✓</span>}
              Job Status: {status.statusText}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {status.instanceType}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Progress</span>
              <span className="text-muted-foreground">
                {status.progressPercent.toFixed(1)}%
              </span>
            </div>
            <Progress value={status.progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {status.progress[0].toLocaleString()} /{" "}
                {status.progress[1].toLocaleString()}
              </span>
              {!isComplete && status.eta && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  ETA: {status.eta}
                </span>
              )}
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2 md:grid-cols-4">
            {/* Speed */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                Speed
              </div>
              <div className="text-2xl font-bold">{status.speedFormatted}</div>
            </div>

            {/* Recovered */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Gauge className="h-3 w-3" />
                Recovered
              </div>
              <div className="text-2xl font-bold">
                {status.recovered[0]} / {status.recovered[1]}
              </div>
            </div>

            {/* Runtime */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Runtime
              </div>
              <div className="text-2xl font-bold">
                {formatRuntime(status.execRuntime)}
              </div>
            </div>

            {/* Status Code */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Cpu className="h-3 w-3" />
                Status
              </div>
              <div className="text-xl font-bold">{status.statusText}</div>
            </div>
          </div>

          {/* Additional Info */}
          {status.rejected > 0 && (
            <div className="rounded-md bg-yellow-50 p-3 text-sm dark:bg-yellow-950">
              <span className="font-medium">Rejected: </span>
              <span>{status.rejected.toLocaleString()} candidates</span>
            </div>
          )}

          {/* Last Update Time */}
          <div className="text-xs text-muted-foreground">
            Last updated: {new Date(status.timestamp).toLocaleTimeString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Format runtime from milliseconds to human-readable string
 */
function formatRuntime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
