import childProcess from "child_process";
import fs from "fs";

import { parseHashcatPot } from "./data";
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
    "-O",
    "--potfile-disable",
    "--status",
    "--status-timer=10",
    "--machine-readable",
  ];

  // Custom charset definitions must come before the mask/input args
  if (hexCharset) args.push("--hex-charset");
  if (customCharset1) args.push("-1", customCharset1);

  // Output file and input file
  args.push("-o", outputFile, inputFile);

  if (attackMode === 3 && mask) {
    // Mask/brute-force: the mask pattern replaces the wordlist
    args.push(mask);
  } else if (wordlistFile) {
    // Dictionary attack: append the wordlist file
    args.push(wordlistFile);
  }

  // If a rule file is provided, append the -r option (only valid for -a 0)
  if (ruleFile && attackMode === 0) {
    args.push("-r", ruleFile);
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

  // Capture stdout for status updates (machine-readable STATUS lines)
  if (process.stdout) {
    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("[Hashcat] STDOUT:", output.trim());
      // Parse each line for machine-readable status
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("STATUS")) {
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

export function readHashcatPot(path: string): Record<string, string> {
  if (!fs.existsSync(path)) return {};

  return parseHashcatPot(fs.readFileSync(path, { encoding: "utf-8" }));
}
