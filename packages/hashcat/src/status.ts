/**
 * Hashcat status parser (`--status-json`)
 *
 * With `--status-json`, hashcat emits ONE JSON object per status interval, e.g.:
 *
 *   {
 *     "session": "hashcat",
 *     "status": 3,
 *     "target": "hashes.txt",
 *     "progress": [12345, 100000],
 *     "restore_point": 12000,
 *     "recovered_hashes": [1, 5],
 *     "recovered_salts": [1, 5],
 *     "rejected": 0,
 *     "devices": [ { "device_id": 1, "speed": 123456.7, "exec_msec": 12.3, ... } ],
 *     "time_start": 1700000000,
 *     "estimated_stop": 1700000123
 *   }
 *
 * This replaces the old `--machine-readable` positional parser, which read a
 * SINGLE device's speed (`SPEED <n> ...`) and so under-reported throughput on
 * multi-GPU boxes, mis-derived the ETA from a fragile token offset, and had no
 * access to the real restore point. The JSON form gives us the per-device speed
 * array (summed for true aggregate H/s), an absolute `estimated_stop`, and the
 * `restore_point` needed for checkpoint/restore.
 */

export interface HashcatStatus {
  timestamp: number;
  sessionName: string;
  statusCode: number;
  statusText: string;
  target: string;
  progress: [number, number]; // [current, total]
  progressPercent: number;
  restorePoint: number;
  recovered: [number, number]; // [hashes, total]
  rejected: number;
  speed: number; // raw aggregate H/s (summed across all devices)
  speedFormatted: string; // e.g., "1.23 MH/s"
  execRuntime: number; // milliseconds elapsed since time_start
  estimatedStop: number; // unix timestamp (seconds)
  eta: string; // formatted time remaining
}

const STATUS_CODES: Record<number, string> = {
  0: "Initializing",
  1: "Autotuning",
  2: "Self-testing",
  3: "Running",
  4: "Paused",
  5: "Exhausted",
  6: "Cracked",
  7: "Aborted",
  8: "Quit",
  9: "Bypass",
  10: "Aborted (Checkpoint)",
  11: "Aborted (Runtime)",
  12: "Error",
  13: "Aborted (Finish)",
  14: "Autotuning",
};

interface HashcatStatusJson {
  session?: string;
  status?: number;
  target?: string;
  progress?: [number, number] | number[];
  restore_point?: number;
  recovered_hashes?: [number, number] | number[];
  rejected?: number;
  devices?: { device_id?: number; speed?: number; exec_msec?: number }[];
  time_start?: number;
  estimated_stop?: number;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Parse one `--status-json` line from hashcat into a HashcatStatus.
 *
 * `line` must be a single complete JSON object (callers buffer partial lines
 * before calling). Returns null if the line is not parseable JSON — non-status
 * stdout (banners, warnings) is silently ignored.
 */
export function parseHashcatStatus(line: string): HashcatStatus | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;

  let json: HashcatStatusJson;
  try {
    json = JSON.parse(trimmed) as HashcatStatusJson;
  } catch {
    // Not (yet) a complete JSON object — ignore.
    return null;
  }

  // A real status object always carries a numeric `status` code; anything else
  // parsed from stdout that happens to be JSON is not a status update.
  if (typeof json.status !== "number") return null;

  try {
    const now = Date.now();

    const statusCode = num(json.status);

    // Aggregate speed = sum of every device's H/s. Single-GPU boxes have a
    // one-element array, so this is correct in both cases (the old parser only
    // ever read the first device).
    const speed = Array.isArray(json.devices)
      ? json.devices.reduce((sum, d) => sum + num(d?.speed), 0)
      : 0;

    const progressCurrent = num(json.progress?.[0]);
    const progressTotal = num(json.progress?.[1], 1);
    const progressPercent =
      progressTotal > 0
        ? Math.min(100, (progressCurrent / progressTotal) * 100)
        : 0;

    const recoveredHashes = num(json.recovered_hashes?.[0]);
    const totalHashes = num(json.recovered_hashes?.[1]);

    const rejected = num(json.rejected);
    const restorePoint = num(json.restore_point);

    // Elapsed wall-clock runtime in ms, derived from the absolute start time
    // hashcat reports. (The old parser multiplied an already-ms field by 1000.)
    const timeStart = num(json.time_start);
    const execRuntime = timeStart > 0 ? Math.max(0, now - timeStart * 1000) : 0;

    // ETA from the absolute estimated stop time. hashcat reports 0 (or a past
    // timestamp) when it cannot estimate yet (autotune / near-zero speed).
    const estimatedStop = num(json.estimated_stop);
    const nowSeconds = Math.floor(now / 1000);
    const msRemaining =
      estimatedStop > nowSeconds ? (estimatedStop - nowSeconds) * 1000 : 0;

    return {
      timestamp: now,
      sessionName: typeof json.session === "string" ? json.session : "",
      statusCode,
      statusText: STATUS_CODES[statusCode] || "Unknown",
      target: typeof json.target === "string" ? json.target : "",
      progress: [progressCurrent, progressTotal],
      progressPercent,
      restorePoint,
      recovered: [recoveredHashes, totalHashes],
      rejected,
      speed,
      speedFormatted: formatSpeed(speed),
      execRuntime,
      estimatedStop,
      eta: formatEtaFromMs(msRemaining),
    };
  } catch (error) {
    console.error(
      "[Hashcat Status Parser] Failed to parse status JSON:",
      error
    );
    console.error("[Hashcat Status Parser] Line was:", line);
    return null;
  }
}

/**
 * Format speed in human-readable form
 */
function formatSpeed(speedRaw: number): string {
  if (speedRaw === 0) return "0 H/s";

  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s"];
  let speed = speedRaw;
  let unitIndex = 0;

  while (speed >= 1000 && unitIndex < units.length - 1) {
    speed /= 1000;
    unitIndex++;
  }

  return `${speed.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format ETA from milliseconds remaining
 */
function formatEtaFromMs(msRemaining: number): string {
  if (msRemaining === 0) return "Unknown";

  const secondsRemaining = Math.floor(msRemaining / 1000);

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Check if a line is a hashcat `--status-json` status line (a JSON object).
 */
export function isStatusLine(line: string): boolean {
  return line.trim().startsWith("{");
}
