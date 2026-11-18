import { desEcbEncryptBlock } from "../src/des";

describe("desEcbEncryptBlock — DES-ECB known-answer tests", () => {
  it("matches the openssl-confirmed vector", () => {
    // Independently computed with: printf <pt> | openssl enc -des-ecb -K <key> -nopad
    const key = Buffer.from("8e1f3b2d5a7c9e04", "hex");
    const pt = Buffer.from("1122334455667788", "hex");
    expect(desEcbEncryptBlock(key, pt).toString("hex")).toBe(
      "d5a44fd1f4d5f78f"
    );
  });

  it("matches the FIPS-81 single-block vector", () => {
    const key = Buffer.from("0123456789abcdef", "hex");
    const pt = Buffer.from("4e6f772069732074", "hex"); // "Now is t"
    expect(desEcbEncryptBlock(key, pt).toString("hex")).toBe(
      "3fa40e8a984d4815"
    );
  });
});
