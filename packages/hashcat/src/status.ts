/**
 * Hashcat machine-readable status parser
 *
 * With --machine-readable flag, hashcat outputs:
 * STATUS {status_code} SPEED {speed} {total} {ms_running} {ms_etc} EXEC_RUNTIME {exec_ms} ... PROGRESS {current} {total} RECHASH {recovered} {total_hashes} RECSALT {recovered_salts} {total_salts} ... REJECTED {count}
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
  recovered: [number, number]; // [hashes, salts]
  rejected: number;
  speed: number; // raw H/s
  speedFormatted: string; // e.g., "1.23 MH/s"
  execRuntime: number; // milliseconds
  estimatedStop: number; // unix timestamp
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

/**
 * Parse a machine-readable STATUS line from hashcat
 * Format: STATUS {code} SPEED {speed} {total} {ms_running} {ms_etc} EXEC_RUNTIME ... PROGRESS {current} {total} RECHASH {recovered} {total} RECSALT {rec} {total} ... REJECTED {count}
 */
export function parseHashcatStatus(line: string): HashcatStatus | null {
  if (!line.startsWith("STATUS")) {
    return null;
  }

  try {
    // Split by whitespace and parse key-value pairs
    const tokens = line.split(/\s+/);

    // Find index of each keyword
    const statusIdx = tokens.indexOf("STATUS");
    const speedIdx = tokens.indexOf("SPEED");
    const progressIdx = tokens.indexOf("PROGRESS");
    const rechashIdx = tokens.indexOf("RECHASH");
    const recsaltIdx = tokens.indexOf("RECSALT");
    const rejectedIdx = tokens.indexOf("REJECTED");
    const execRuntimeIdx = tokens.indexOf("EXEC_RUNTIME");

    // Parse STATUS code (comes right after STATUS keyword)
    const statusCode =
      statusIdx >= 0 && statusIdx + 1 < tokens.length
        ? parseInt(tokens[statusIdx + 1]!, 10)
        : 0;

    // Parse SPEED (first number after SPEED keyword is the speed in H/s)
    const speed =
      speedIdx >= 0 && speedIdx + 1 < tokens.length
        ? parseFloat(tokens[speedIdx + 1]!)
        : 0;

    // Parse PROGRESS (current and total)
    const progressCurrent =
      progressIdx >= 0 && progressIdx + 1 < tokens.length
        ? parseInt(tokens[progressIdx + 1]!, 10)
        : 0;
    const progressTotal =
      progressIdx >= 0 && progressIdx + 2 < tokens.length
        ? parseInt(tokens[progressIdx + 2]!, 10)
        : 1;

    // Parse RECHASH (recovered hashes and total)
    const recoveredHashes =
      rechashIdx >= 0 && rechashIdx + 1 < tokens.length
        ? parseInt(tokens[rechashIdx + 1]!, 10)
        : 0;
    const totalHashes =
      rechashIdx >= 0 && rechashIdx + 2 < tokens.length
        ? parseInt(tokens[rechashIdx + 2]!, 10)
        : 0;

    // Parse RECSALT (recovered salts and total)
    const recoveredSaltsValue =
      recsaltIdx >= 0 && recsaltIdx + 1 < tokens.length
        ? parseInt(tokens[recsaltIdx + 1]!, 10)
        : 0;
    void recoveredSaltsValue;

    // Parse REJECTED count
    const rejected =
      rejectedIdx >= 0 && rejectedIdx + 1 < tokens.length
        ? parseInt(tokens[rejectedIdx + 1]!, 10)
        : 0;

    // Parse EXEC_RUNTIME (milliseconds)
    const execRuntime =
      execRuntimeIdx >= 0 && execRuntimeIdx + 1 < tokens.length
        ? parseFloat(tokens[execRuntimeIdx + 1]!) * 1000 // convert to milliseconds if needed
        : 0;

    // Calculate ETA from SPEED fields (ms_etc is at speedIdx + 4)
    const msEtc =
      speedIdx >= 0 && speedIdx + 4 < tokens.length
        ? parseInt(tokens[speedIdx + 4]!, 10)
        : 0;
    const estimatedStop =
      msEtc > 0 ? Math.floor(Date.now() / 1000) + Math.floor(msEtc / 1000) : 0;

    // Calculate progress percentage
    const progressPercent =
      progressTotal > 0
        ? Math.min(100, (progressCurrent / progressTotal) * 100)
        : 0;

    // Format speed
    const speedFormatted = formatSpeed(speed);

    // Calculate ETA from milliseconds
    const eta = formatEtaFromMs(msEtc);

    return {
      timestamp: Date.now(),
      sessionName: "",
      statusCode,
      statusText: STATUS_CODES[statusCode] || "Unknown",
      target: "",
      progress: [progressCurrent, progressTotal],
      progressPercent,
      restorePoint: 0,
      recovered: [recoveredHashes, totalHashes],
      rejected,
      speed,
      speedFormatted,
      execRuntime,
      estimatedStop,
      eta,
    };
  } catch (error) {
    console.error(
      "[Hashcat Status Parser] Failed to parse status line:",
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
 * Check if a line is a machine-readable status line
 */
export function isStatusLine(line: string): boolean {
  return line.startsWith("STATUS");
}
