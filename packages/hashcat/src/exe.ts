import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type HashType, getHashcatMode, parseHashcatPot } from "./data";

interface HashcatConfig {
  exePath: string;
  inputFile: string;
  outputFile: string;
  hashType: HashType;
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
  const exe = path.basename(exePath);
  const exeCwd = path.dirname(exePath);

  const args = [
    "-a",
    "0",
    "-m",
    getHashcatMode(hashType).toString(),
    "-o",
    outputFile,
    "--potfile-disable",
    inputFile,
    wordlistFile,
  ];

  const process = childProcess.spawn(exe, args, {
    cwd,
    stdio,
  });

  return process;
}

export function readHashcatPot(path: string): Record<string, string> {
  if (!fs.existsSync(path)) return {};

  return parseHashcatPot(fs.readFileSync(path, { encoding: "utf-8" }));
}
