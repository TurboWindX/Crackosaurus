import { isStatusLine, parseHashcatStatus } from "../src/status";

describe("parseHashcatStatus (--status-json)", () => {
  it("sums per-device speed across multiple GPUs", () => {
    const line = JSON.stringify({
      status: 3,
      devices: [{ speed: 1000 }, { speed: 2000 }],
      progress: [50, 100],
      recovered_hashes: [1, 2],
    });
    const s = parseHashcatStatus(line);
    expect(s).not.toBeNull();
    expect(s!.speed).toBe(3000); // old parser read only device #1
    expect(s!.progressPercent).toBe(50);
    expect(s!.recovered).toEqual([1, 2]);
  });

  it("returns null for a non-JSON status line", () => {
    expect(parseHashcatStatus("Session..........: hashcat")).toBeNull();
  });

  it("returns null for JSON without a numeric status field", () => {
    expect(parseHashcatStatus(JSON.stringify({ foo: 1 }))).toBeNull();
  });
});

describe("isStatusLine", () => {
  it("recognizes a JSON status object", () => {
    expect(isStatusLine('{"status":3}')).toBe(true);
  });
  it("rejects a plain log line", () => {
    expect(isStatusLine("Started: ...")).toBe(false);
  });
});
