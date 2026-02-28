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
  const resolved = path.resolve(wordlistRoot, wordlist);
  const root = path.resolve(wordlistRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path traversal detected: ${wordlist}`);
  }
  return resolved;
}

// Re-export rule folder helper for backward-compatible imports
export { createRuleFolder } from "./rule";
export { getRulePath } from "./rule";
