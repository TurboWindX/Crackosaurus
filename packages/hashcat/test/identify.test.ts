import { identifyHash } from "../src/identify";

describe("identifyHash — structural prefixes (high confidence)", () => {
  it("identifies ConfigMgr $sccm$aes128$ as 19850, ranked first", () => {
    const h =
      "$sccm$aes128$0000edec14000000b2320000c03200000e6600000000000011cb54aa3b699f61f86ab312e6fb97ec";
    const candidates = identifyHash(h);
    expect(candidates[0].mode).toBe(19850);
    expect(candidates[0].confidence).toBe("high");
  });

  it("identifies bcrypt", () => {
    expect(identifyHash(`$2b$12$${"a".repeat(53)}`)[0].mode).toBe(3200);
  });

  it("identifies Kerberos 5 TGS-REP etype 23", () => {
    expect(identifyHash("$krb5tgs$23$something")[0].mode).toBe(13100);
  });
});

describe("identifyHash — ambiguous bare hex", () => {
  it("returns NTLM and MD5 among candidates for a 32-hex string", () => {
    const modes = identifyHash("a".repeat(32)).map((c) => c.mode);
    expect(modes).toContain(1000); // NTLM
    expect(modes).toContain(0); // MD5
  });
});
