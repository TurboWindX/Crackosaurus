import path from "path";

import { getRulePath } from "../src/rule";
import { getWordlistPath } from "../src/wordlist";

const ROOT = path.resolve("test-fixture-root");

describe("getWordlistPath — path-traversal containment", () => {
  it("resolves a plain name under the root", () => {
    expect(getWordlistPath(ROOT, "rockyou.txt")).toBe(
      path.join(ROOT, "rockyou.txt")
    );
  });
  it("allows a nested subpath under the root", () => {
    expect(getWordlistPath(ROOT, path.join("sub", "list.txt"))).toBe(
      path.join(ROOT, "sub", "list.txt")
    );
  });
  it("rejects ../ traversal out of the root", () => {
    expect(() => getWordlistPath(ROOT, "../secret.txt")).toThrow(
      /Path traversal/
    );
  });
  it("rejects an absolute path that escapes the root", () => {
    expect(() => getWordlistPath(ROOT, path.resolve("/etc/passwd"))).toThrow(
      /Path traversal/
    );
  });
});

describe("getRulePath — path-traversal containment", () => {
  it("resolves a plain name under the root", () => {
    expect(getRulePath(ROOT, "best64.rule")).toBe(
      path.join(ROOT, "best64.rule")
    );
  });
  it("rejects ../ traversal out of the root", () => {
    expect(() => getRulePath(ROOT, "../../x.rule")).toThrow(/Path traversal/);
  });
});
