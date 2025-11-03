import childProcess from "child_process";
import fs from "fs";

import { parseHashcatPot } from "./data";

interface HashcatConfig {
  exePath: string;
  inputFile: string;
  outputFile: string;
  hashType: number;
  wordlistFile: string;
  cwd?: string;
  stdio?: "inherit";
}

export function hashcat({
  exePath,
  inputFile,
  outputFile,
  hashType,
  wordlistFile,
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

  console.log("[Hashcat] Spawning hashcat process");
  console.log("[Hashcat] Executable:", exePath);
  console.log("[Hashcat] Args:", args.join(" "));
  console.log("[Hashcat] Working directory:", cwd);

  const process = childProcess.spawn(exePath, args, {
    cwd,
    stdio,
  });

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
