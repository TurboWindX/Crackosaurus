import os from "os";
import path from "path";

const tmpRoot = os.tmpdir();

export const DEFAULT_INSTANCE_ROOT = path.join(
  tmpRoot,
  "crackosaurus",
  "instances"
);

export const DEFAULT_WORDLIST_ROOT = path.join(
  tmpRoot,
  "crackosaurus",
  "wordlists"
);
