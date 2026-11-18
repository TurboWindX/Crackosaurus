import path from "path";

import { STATUS } from "@repo/api";

import {
  getJobFolderPath,
  getJobHashPath,
  getJobOutputPath,
  JOB_METADATA,
} from "../src/cluster";

const ROOT = path.resolve("fixture-instances-root");

describe("job path helpers", () => {
  it("builds the job folder under instance/jobs/<jobID>", () => {
    expect(getJobFolderPath(ROOT, "inst-1", "job-1")).toBe(
      path.join(ROOT, "inst-1", "jobs", "job-1")
    );
  });
  it("builds the hashes file path inside the job folder", () => {
    const folder = getJobFolderPath(ROOT, "inst-1", "job-1");
    expect(getJobHashPath(ROOT, "inst-1", "job-1").startsWith(folder)).toBe(
      true
    );
    expect(getJobHashPath(ROOT, "inst-1", "job-1")).toMatch(/hashes\.txt$/);
  });
  it("builds the output pot path inside the job folder", () => {
    expect(getJobOutputPath(ROOT, "inst-1", "job-1")).toMatch(/\.pot$/);
  });
});

describe("JOB_METADATA schema", () => {
  it("accepts a minimal valid metadata object", () => {
    const parsed = JOB_METADATA.parse({
      status: STATUS.Pending,
      hashType: 1000,
      wordlist: "rockyou.txt",
    });
    expect(parsed.hashType).toBe(1000);
  });

  it("accepts optional attackMode + mask", () => {
    const parsed = JOB_METADATA.parse({
      status: STATUS.Running,
      hashType: 19850,
      wordlist: "",
      attackMode: 3,
      mask: "?a?a?a",
    });
    expect(parsed.attackMode).toBe(3);
    expect(parsed.mask).toBe("?a?a?a");
  });

  it("rejects when a required field (hashType) is missing", () => {
    expect(() =>
      JOB_METADATA.parse({ status: STATUS.Pending, wordlist: "x" })
    ).toThrow();
  });

  it("rejects an unknown status value", () => {
    expect(() =>
      JOB_METADATA.parse({ status: "NONSENSE", hashType: 0, wordlist: "" })
    ).toThrow();
  });
});
