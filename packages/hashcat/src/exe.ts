import childProcess from "node:child_process";
import fs from "node:fs";

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

  const process = childProcess.spawn(exePath, args, {
    cwd,
    stdio,
  });

  return process;
}

export function readHashcatPot(path: string): Record<string, string> {
  if (!fs.existsSync(path)) return {};

  return parseHashcatPot(fs.readFileSync(path, { encoding: "utf-8" }));
}
