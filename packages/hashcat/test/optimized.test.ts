import {
  maskCandidateLength,
  OPTIMIZED_MASK_MAX_LEN,
  shouldUseOptimized,
} from "../src/optimized";

describe("maskCandidateLength", () => {
  it("counts each literal char as one position", () => {
    expect(maskCandidateLength("abc")).toBe(3);
  });

  it("counts each ?x token as one position", () => {
    expect(maskCandidateLength("?d?d?d")).toBe(3);
    expect(maskCandidateLength("?l?u?s?a")).toBe(4);
  });

  it("handles mixed literals and tokens", () => {
    expect(maskCandidateLength("Password?d")).toBe(9); // 8 literals + 1 token
  });

  it("treats ?? as a single literal '?' position", () => {
    expect(maskCandidateLength("??")).toBe(1);
  });

  it("is zero for an empty mask", () => {
    expect(maskCandidateLength("")).toBe(0);
  });
});

describe("shouldUseOptimized (default pure; -O only when it cannot truncate)", () => {
  it("is false for dictionary attacks (a0) — candidate length unknowable", () => {
    expect(shouldUseOptimized(0, undefined)).toBe(false);
  });

  it("is false for combinator attacks (a1)", () => {
    expect(shouldUseOptimized(1, undefined)).toBe(false);
  });

  it("is true for a short mask (a3) within the cap", () => {
    expect(shouldUseOptimized(3, "?a?a?a?a?a?a?a?a")).toBe(true); // 8 <= 15
  });

  it("is true exactly at the cap boundary", () => {
    expect(shouldUseOptimized(3, "?d".repeat(OPTIMIZED_MASK_MAX_LEN))).toBe(true);
  });

  it("is false for a mask one position over the cap", () => {
    expect(
      shouldUseOptimized(3, "?a".repeat(OPTIMIZED_MASK_MAX_LEN + 1))
    ).toBe(false);
  });

  it("is false for a3 with no/empty mask", () => {
    expect(shouldUseOptimized(3, undefined)).toBe(false);
    expect(shouldUseOptimized(3, "")).toBe(false);
  });
});
