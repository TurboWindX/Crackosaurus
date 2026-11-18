import { getShuckMode, isShuckableHashType } from "../src/shuck";

describe("getShuckMode", () => {
  it("NetNTLMv1 (5500) -> NT-candidate mode 27000", () => {
    expect(getShuckMode(5500)).toBe(27000);
  });
  it("NetNTLMv2 (5600) -> NT-candidate mode 27100", () => {
    expect(getShuckMode(5600)).toBe(27100);
  });
  it("DCC2 (2100) -> 31600", () => {
    expect(getShuckMode(2100)).toBe(31600);
  });
  it("plain NTLM (1000) is not shuckable", () => {
    expect(getShuckMode(1000)).toBeNull();
  });
});

describe("isShuckableHashType agrees with getShuckMode", () => {
  it("true for a shuckable type", () => {
    expect(isShuckableHashType(5500)).toBe(true);
  });
  it("false for a non-shuckable type", () => {
    expect(isShuckableHashType(0)).toBe(false);
  });
});
