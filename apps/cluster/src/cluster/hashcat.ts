import { type HashType } from "@repo/api";

export function getHashcatMode(type: HashType): number {
  switch (type) {
    case "NTLM":
      return 1000;
    case "bcrypt":
      return 3200;
    default:
      return -1;
  }
}
