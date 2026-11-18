import { STATUS } from "@repo/api";

import { classifyHashcatCompletion } from "../src/outcome";

describe("classifyHashcatCompletion", () => {
  it("returns null while the process is still running (no exit, no signal)", () => {
    expect(classifyHashcatCompletion(null, null)).toBeNull();
  });

  it("exit 0 (all cracked) → Complete", () => {
    expect(classifyHashcatCompletion(0, null)?.status).toBe(STATUS.Complete);
  });

  it("exit 1 (exhausted) → Complete", () => {
    expect(classifyHashcatCompletion(1, null)?.status).toBe(STATUS.Complete);
  });

  it("exit 2 (user abort) → Stopped", () => {
    expect(classifyHashcatCompletion(2, null)?.status).toBe(STATUS.Stopped);
  });

  it("any other non-zero exit → Error", () => {
    expect(classifyHashcatCompletion(3, null)?.status).toBe(STATUS.Error);
    expect(classifyHashcatCompletion(255, null)?.status).toBe(STATUS.Error);
  });

  it("signal kill (exitCode null, signal set) → Error, NOT null — the wedge fix", () => {
    const r = classifyHashcatCompletion(null, "SIGKILL");
    expect(r).not.toBeNull();
    expect(r?.status).toBe(STATUS.Error);
    expect(r?.description).toMatch(/SIGKILL/);
  });

  it("SIGSEGV is also a terminal Error", () => {
    expect(classifyHashcatCompletion(null, "SIGSEGV")?.status).toBe(
      STATUS.Error
    );
  });
});
