import {
  contractDesKey,
  desKeyToNtlmFragment,
  expandDesKey,
} from "../src/ntlmv1";

describe("DES key expand/contract are mutual inverses", () => {
  it("contract(expand(fragment)) === fragment", () => {
    const fragment = Buffer.from("01020304050607", "hex"); // 7 bytes
    expect(contractDesKey(expandDesKey(fragment)).toString("hex")).toBe(
      fragment.toString("hex")
    );
  });
});

describe("desKeyToNtlmFragment — $HEX handling (regression: silent NTLMv1 zero-recovery)", () => {
  // hashcat writes a cracked mode-14000 DES key as $HEX[..] because the key
  // bytes are almost always non-printable. The old code did Buffer.from(v,"hex")
  // on that, got an empty buffer, threw in contractDesKey, and the swallowed
  // error made the whole NTLMv1 pipeline recover zero hashes.
  const fragment = Buffer.from("aabbccddeeff11", "hex"); // 7-byte NT fragment
  const key8 = expandDesKey(fragment); // 8-byte DES key (what hashcat cracks)

  it("decodes a $HEX[..] pot plaintext to the correct fragment", () => {
    expect(desKeyToNtlmFragment(`$HEX[${key8.toString("hex")}]`)).toBe(
      fragment.toString("hex")
    );
  });

  it("does not throw on $HEX input", () => {
    expect(() =>
      desKeyToNtlmFragment(`$HEX[${key8.toString("hex")}]`)
    ).not.toThrow();
  });

  it("decodes a literal (printable) plaintext as raw bytes", () => {
    expect(desKeyToNtlmFragment(key8.toString("latin1"))).toBe(
      fragment.toString("hex")
    );
  });
});
