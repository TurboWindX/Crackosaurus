import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type HashType, getHashcatMode, parseHashcatPot } from "./data";

interface HashcatConfig {
  exePath: string;
  inputFile: string;
  outputFile: string;
  hashType: HashType;
  wordlistFile: string;
}

export function hashcat({
  exePath,
  inputFile,
  outputFile,
  hashType,
  wordlistFile,
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

  const process = child_process.spawn(exe, args, {
    cwd: exeCwd,
  });

  return process;
}

export function readHashcatPot(path: string): Record<string, string> {
  if (!fs.existsSync(path)) return {};

  return parseHashcatPot(fs.readFileSync(path, { encoding: "utf-8" }));
}
