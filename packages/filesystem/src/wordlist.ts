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
