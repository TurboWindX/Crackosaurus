import fs from "fs";
import path from "path";

export function createRuleFolder(ruleRoot: string): void {
  if (fs.existsSync(ruleRoot)) return;

  fs.mkdirSync(ruleRoot, { recursive: true });
}

export function getRulePath(ruleRoot: string, rule: string): string {
  return path.join(ruleRoot, rule);
}
