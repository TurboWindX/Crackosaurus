import fs from "fs";
import path from "path";

export function createWordlistFolder(wordlistRoot: string): void {
  if (fs.existsSync(wordlistRoot)) return;

  fs.mkdirSync(wordlistRoot, { recursive: true });
}

export function getWordlistPath(
  wordlistRoot: string,
  wordlist: string
): string {
  return path.join(wordlistRoot, wordlist);
}

// Re-export rule folder helper for backward-compatible imports
export { createRuleFolder } from "./rule";
export { getRulePath } from "./rule";
