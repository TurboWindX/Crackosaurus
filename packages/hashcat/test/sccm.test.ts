import crypto from "crypto";

import {
  decryptSccmMediaVariables,
  deriveSccmAesKey,
  parseMediaVariables,
  SccmDecryptError,
} from "../src/sccm";

/**
 * Encrypt a UTF-16LE XML plaintext as SCCM would (AES-128-CBC, zero IV,
 * PKCS#7) and prepend the 24-byte header (ALG_ID = CALG_AES_128).
 */
function synthesizeSccmFile(xml: string, password: string): Buffer {
  const ptLE = Buffer.from(xml, "utf16le");
  const padLen = 16 - (ptLE.length % 16); // PKCS#7
  const padded = Buffer.concat([ptLE, Buffer.alloc(padLen, padLen)]);

  const key = deriveSccmAesKey(password);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0));
  cipher.setAutoPadding(false);
  const ct = Buffer.concat([cipher.update(padded), cipher.final()]);

  const header = Buffer.alloc(24);
  header.writeUInt32LE(0x0000660e, 16); // CALG_AES_128
  return Buffer.concat([header, ct]);
}

describe("deriveSccmAesKey — known-answer vector (mode 19850 self-test)", () => {
  it("encrypting '<?xml ve' under the derived key yields the self-test ciphertext", () => {
    const key = deriveSccmAesKey("Password1");
    const pt = Buffer.from("<?xml ve", "utf16le");
    const c = crypto.createCipheriv("aes-128-ecb", key, null);
    c.setAutoPadding(false);
    const ct = Buffer.concat([c.update(pt), c.final()]).toString("hex");
    expect(ct).toBe("11cb54aa3b699f61f86ab312e6fb97ec");
  });
});

describe("decryptSccmMediaVariables — round-trip", () => {
  const XML =
    '<?xml version="1.0"?>' +
    "<MediaVarList>" +
    '<variable name="OSDJoinAccount" property="SomeAttr">DOMAIN\\svc-join</variable>' +
    '<variable name="OSDJoinPassword">S3cret!!</variable>' +
    '<variable name="NetworkAccessUsername">DOMAIN\\naa-svc</variable>' +
    '<variable name="NetworkAccessPassword">NaaP@ss</variable>' +
    "</MediaVarList>";

  it("decrypts the file and recovers the original XML", () => {
    const file = synthesizeSccmFile(XML, "Password1");
    const { xml } = decryptSccmMediaVariables(file, "Password1");
    expect(xml).toBe(XML);
  });

  it("parseMediaVariables pulls the credential fields out", () => {
    const file = synthesizeSccmFile(XML, "Password1");
    const { xml } = decryptSccmMediaVariables(file, "Password1");
    const vars = parseMediaVariables(xml);
    expect(vars.OSDJoinAccount).toBe("DOMAIN\\svc-join");
    expect(vars.OSDJoinPassword).toBe("S3cret!!");
    expect(vars.NetworkAccessUsername).toBe("DOMAIN\\naa-svc");
    expect(vars.NetworkAccessPassword).toBe("NaaP@ss");
  });
});

describe("decryptSccmMediaVariables — error paths", () => {
  const good = synthesizeSccmFile("<?xml ver?><a/>", "Password1");

  it("WRONG_PASSWORD when the derived key doesn't decrypt the XML header", () => {
    try {
      decryptSccmMediaVariables(good, "nope");
      fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SccmDecryptError);
      expect((e as SccmDecryptError).code).toBe("WRONG_PASSWORD");
    }
  });

  it("FILE_TOO_SHORT for a truncated file", () => {
    expect(() =>
      decryptSccmMediaVariables(Buffer.alloc(10), "Password1")
    ).toThrow(/FILE_TOO_SHORT|file is/i);
  });

  it("WRONG_ALG_ID when the ALG_ID is not CALG_AES_128", () => {
    const bad = Buffer.from(good);
    bad.writeUInt32LE(0x6610, 16); // CALG_AES_256
    try {
      decryptSccmMediaVariables(bad, "Password1");
      fail("expected throw");
    } catch (e) {
      expect((e as SccmDecryptError).code).toBe("WRONG_ALG_ID");
    }
  });
});

describe("parseMediaVariables", () => {
  it("handles both <variable> and <var>", () => {
    const xml =
      '<root><var name="A">one</var><variable name="B" prop="x">two</variable></root>';
    expect(parseMediaVariables(xml)).toEqual({ A: "one", B: "two" });
  });
  it("returns {} when no matches", () => {
    expect(parseMediaVariables("<root/>")).toEqual({});
  });
});
