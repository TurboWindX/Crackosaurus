import childProcess from "child_process";
import fs from "fs";

import { parseHashcatPot } from "./data";

interface HashcatConfig {
  exePath: string;
  inputFile: string;
  outputFile: string;
  hashType: number;
  wordlistFile: string;
  rulesFile?: string;
  cwd?: string;
  stdio?: "inherit";
}

export function hashcat({
  exePath,
  inputFile,
  outputFile,
  hashType,
  wordlistFile,
  rulesFile,
  cwd,
  stdio,
}: HashcatConfig) {
  const args = [
    "-a",
    "0",
    "-m",
    hashType.toString(),
    "--potfile-disable",
    "-o",
    outputFile,
    inputFile,
    wordlistFile,
  ];

  if (rulesFile) {
    args.push("-r", rulesFile);
  }

  console.log("[Hashcat] Spawning hashcat process");
  console.log("[Hashcat] Executable:", exePath);
  console.log("[Hashcat] Args:", args.join(" "));
  console.log("[Hashcat] Working directory:", cwd);

  const process = childProcess.spawn(exePath, args, {
    cwd,
    stdio,
  });

  // Capture stderr for error logging
  if (process.stderr) {
    let stderrBuffer = "";
    process.stderr.on("data", (data) => {
      stderrBuffer += data.toString();
    });
    
    process.on("exit", (code) => {
      if (code !== 0 && stderrBuffer) {
        console.error("[Hashcat] STDERR output:", stderrBuffer);
      }
    });
  }

  // Capture stdout for status updates
  if (process.stdout) {
    process.stdout.on("data", (data) => {
      const output = data.toString();
      // Log hashcat status updates
      if (output.includes("Status") || output.includes("Progress") || output.includes("Recovered")) {
        console.log("[Hashcat]", output.trim());
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
        console.log("[Hashcat] Job completed - exhausted wordlist (some hashes may remain uncracked)");
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
