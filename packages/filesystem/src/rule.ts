import fs from "fs";
import path from "path";

export function createRuleFolder(ruleRoot: string): void {
  if (fs.existsSync(ruleRoot)) return;

  fs.mkdirSync(ruleRoot, { recursive: true });
}

export function getRulePath(ruleRoot: string, rule: string): string {
  const resolved = path.resolve(ruleRoot, rule);
  const root = path.resolve(ruleRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path traversal detected: ${rule}`);
  }
  return resolved;
}
