import {
  getHashName,
  HASH_TYPES,
  isSlowHashType,
  parseHashcatPot,
  toHashcatHash,
} from "../src/data";

describe("getHashName", () => {
  it("maps 19850 to sccm_aes128", () => {
    expect(getHashName(19850)).toBe("sccm_aes128");
  });
  it("maps 1000 to ntlm", () => {
    expect(getHashName(1000)).toBe("ntlm");
  });
  it("falls back to the numeric string for unknown modes", () => {
    expect(getHashName(424242)).toBe("424242");
  });
});

describe("toHashcatHash", () => {
  it("lowercases fast raw-hex modes", () => {
    expect(toHashcatHash(HASH_TYPES.ntlm, "AABBCCDD")).toBe("aabbccdd");
  });
  it("leaves structured hashes untouched (case-sensitive payload)", () => {
    const v = "$sccm$aes128$ABCDEF";
    expect(toHashcatHash(19850, v)).toBe(v);
  });
});

describe("parseHashcatPot", () => {
  it("parses simple hash:plain lines", () => {
    const pot = parseHashcatPot("5f4dcc3b5aa765d61d8327deb882cf99:password");
    expect(pot["5f4dcc3b5aa765d61d8327deb882cf99"]).toBe("password");
  });
  it("keeps colon-bearing keys intact when given knownHashes", () => {
    const key = "aad3b435b51404ee:1122334455667788";
    const pot = parseHashcatPot(`${key}:Password1`, [key]);
    expect(pot[key]).toBe("Password1");
  });
});

describe("isSlowHashType", () => {
  it("bcrypt (3200) is slow", () => {
    expect(isSlowHashType(3200)).toBe(true);
  });
  it("ntlm (1000) is not slow", () => {
    expect(isSlowHashType(1000)).toBe(false);
  });
  it("sccm 19850 is not slow (single AES block)", () => {
    expect(isSlowHashType(19850)).toBe(false);
  });
});
