import childProcess from "child_process";
import fs from "fs";

import { parseHashcatPot } from "./data";
import {
  maskCandidateLength,
  OPTIMIZED_MASK_MAX_LEN,
  shouldUseOptimized,
} from "./optimized";
import { type HashcatStatus, parseHashcatStatus } from "./status";

interface HashcatConfig {
  exePath: string;
  inputFile: string;
  outputFile: string;
  hashType: number;
  wordlistFile?: string;
  ruleFile?: string;
  /** Attack mode: 0 = dictionary (default), 3 = mask/brute-force */
  attackMode?: number;
  /** Mask pattern for attack mode 3, e.g. "?a?a?a?a?a?a?a" */
  mask?: string;
  /** Custom charset 1 definition (path to charset file or inline hex string) */
  customCharset1?: string;
  /** Treat custom charset definitions as hex-encoded */
  hexCharset?: boolean;
  cwd?: string;
  stdio?: "inherit";
  /** Called whenever hashcat emits a machine-readable status line */
  onStatus?: (status: HashcatStatus) => void;
}

export function hashcat({
  exePath,
  inputFile,
  outputFile,
  hashType,
  wordlistFile,
  ruleFile,
  attackMode = 0,
  mask,
  customCharset1,
  hexCharset,
  cwd,
  stdio,
  onStatus,
}: HashcatConfig) {
  const args: string[] = [
    "-a",
    attackMode.toString(),
    "-m",
    hashType.toString(),
    "--potfile-disable",
    "--status",
    "--status-timer=10",
    // Structured per-interval status as a single JSON object per line. Gives us
    // the per-device speed array (summed for true multi-GPU throughput), an
    // absolute estimated_stop for the ETA, and the restore_point — none of which
    // the old positional --machine-readable format exposed reliably.
    "--status-json",
  ];

  // Optimized kernels (-O) are ~2x faster but cap candidate length and SILENTLY
  // drop anything longer (see ./optimized). Default to pure kernels so we never
  // miss a hit; enable -O only when it provably cannot truncate — a mask attack
  // whose candidate length is within the conservative cap.
  if (shouldUseOptimized(attackMode, mask)) {
    args.push("-O");
    console.log(
      `[Hashcat] Optimized kernels (-O) enabled: mask length ${maskCandidateLength(
        mask!
      )} <= ${OPTIMIZED_MASK_MAX_LEN}, lossless`
    );
  } else {
    console.log(
      "[Hashcat] Pure kernels (no -O): full candidate-length coverage, no silent truncation"
    );
  }

  // Custom charset definitions must come before the mask/input args
  if (hexCharset) args.push("--hex-charset");
  if (customCharset1) args.push("-1", customCharset1);

  // Output file (option, must precede the "--" terminator)
  args.push("-o", outputFile);

  // If a rule file is provided, add the -r option (only valid for -a 0).
  // This is an option and must come before the "--" positional terminator.
  if (ruleFile && attackMode === 0) {
    args.push("-r", ruleFile);
  }

  // End of options. Everything after "--" is treated as a positional
  // argument by hashcat's option parser, so a user-controlled `mask`
  // beginning with "-" can no longer be smuggled in as a hashcat flag
  // (argument injection). inputFile / wordlistFile are server-derived, but
  // the mask is fully attacker-controlled, so this terminator is required.
  args.push("--");

  args.push(inputFile);

  if (attackMode === 3 && mask) {
    // Mask/brute-force: the mask pattern replaces the wordlist
    args.push(mask);
  } else if (wordlistFile) {
    // Dictionary attack: append the wordlist file
    args.push(wordlistFile);
  }

  console.log("[Hashcat] Spawning hashcat process");
  console.log("[Hashcat] Executable:", exePath);
  console.log("[Hashcat] Args:", args.join(" "));
  console.log("[Hashcat] Working directory:", cwd);

  const process = childProcess.spawn(exePath, args, {
    cwd,
    stdio: stdio || "pipe",
  });

  // Capture stderr for error logging
  if (process.stderr) {
    let stderrBuffer = "";
    process.stderr.setEncoding("utf8");
    process.stderr.on("data", (data) => {
      const output = data.toString();
      stderrBuffer += output;
      // Log stderr in real-time (hashcat writes status to stderr)
      console.error("[Hashcat] STDERR:", output.trim());
    });

    process.on("exit", (code) => {
      if (code !== 0 && stderrBuffer) {
        console.error("[Hashcat] Full STDERR output:", stderrBuffer);
      }
    });
  }

  // Capture stdout for status updates (--status-json objects, one per line).
  // A single status object can be split across stdout chunks, so buffer and
  // only process complete newline-terminated lines; the trailing partial line
  // is carried into the next chunk.
  if (process.stdout) {
    process.stdout.setEncoding("utf8");
    let stdoutBuffer = "";
    process.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("[Hashcat] STDOUT:", output.trim());
      stdoutBuffer += output;
      let newlineIdx: number;
      while ((newlineIdx = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, newlineIdx);
        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
        const trimmed = line.trim();
        if (trimmed.startsWith("{")) {
          const parsed = parseHashcatStatus(trimmed);
          if (parsed && onStatus) {
            onStatus(parsed);
          }
        }
      }
    });
  }

  process.on("error", (err) => {
    console.error("[Hashcat] Failed to start hashcat process:", err.message);
    console.error("[Hashcat] Error details:", err);
  });

  process.on("spawn", () => {
    console.log("[Hashcat] Process spawned successfully, PID:", process.pid);
  });

  process.on("exit", (code, signal) => {
    if (code !== null) {
      console.log(`[Hashcat] Process exited with code: ${code}`);
      if (code === 0) {
        console.log("[Hashcat] Job completed - all hashes cracked");
      } else if (code === 1) {
        console.log(
          "[Hashcat] Job completed - exhausted wordlist (some hashes may remain uncracked)"
        );
      } else if (code === 2) {
        console.log("[Hashcat] Job aborted by user");
      } else {
        console.error("[Hashcat] Job failed with unexpected error");
      }
    }
    if (signal !== null) {
      console.log(`[Hashcat] Process killed with signal: ${signal}`);
    }
  });

  return process;
}

export function readHashcatPot(
  path: string,
  knownHashes?: Iterable<string>
): Record<string, string> {
  if (!fs.existsSync(path)) return {};

  return parseHashcatPot(
    fs.readFileSync(path, { encoding: "utf-8" }),
    knownHashes
  );
}
