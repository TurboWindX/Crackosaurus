import { jobRouter } from "../src/routers/jobRouter";
import { makeContext } from "./helpers";

describe("jobRouter — authorization (permissionProcedure)", () => {
  it("rejects requestJobs without instances:jobs:add", async () => {
    const caller = jobRouter.createCaller(makeContext({ permissions: [] }));
    // Permission middleware runs before input parsing, so the input is irrelevant.
    await expect(
      caller.requestJobs({ instanceType: "g6.12xlarge" } as never)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requestJobsForHashes without instances:jobs:add", async () => {
    const caller = jobRouter.createCaller(makeContext({ permissions: [] }));
    await expect(
      caller.requestJobsForHashes({
        instanceType: "g6.12xlarge",
        hashIDs: ["h1"],
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows the permission check to pass with the right grant", async () => {
    // With the grant, the UNAUTHORIZED middleware no longer fires; the call
    // instead fails input validation below (proving we got past authz).
    const caller = jobRouter.createCaller(
      makeContext({ permissions: ["instances:jobs:add"] })
    );
    await expect(
      caller.requestJobsForHashes({
        instanceType: "not-a-real-ec2-type",
        hashIDs: ["h1"],
      })
    ).rejects.not.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("jobRouter — instanceType allowlist (input validation)", () => {
  const grant = () =>
    jobRouter.createCaller(makeContext({ permissions: ["instances:jobs:add"] }));

  it("rejects an arbitrary/oversized EC2 type with BAD_REQUEST", async () => {
    await expect(
      grant().requestJobsForHashes({
        instanceType: "p5.48xlarge",
        hashIDs: ["h1"],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts a real operator GPU type (passes validation, not a zod reject)", async () => {
    // A valid instanceType clears the enum; the call then proceeds into the
    // resolver (which hits the empty prisma mock and throws something that is
    // NOT a BAD_REQUEST zod error). We only assert it was not rejected at the
    // input boundary for instanceType.
    await expect(
      grant().requestJobsForHashes({
        instanceType: "g6.12xlarge",
        hashIDs: ["h1"],
      })
    ).rejects.not.toMatchObject({ code: "BAD_REQUEST" });
  });
});
