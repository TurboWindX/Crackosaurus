import { rainbowRouter } from "../src/routers/rainbowRouter";
import { makeContext, SERVICE_SECRET } from "./helpers";

describe("rainbowRouter — serviceProcedure Bearer gate", () => {
  it("rejects a request with no Authorization header", async () => {
    const caller = rainbowRouter.createCaller(makeContext({}));
    await expect(caller.listUnresolved({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a wrong Bearer token", async () => {
    const caller = rainbowRouter.createCaller(
      makeContext({ authorization: "Bearer not-the-secret" })
    );
    await expect(caller.listUnresolved({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a browser-style session (cookie, no Bearer)", async () => {
    const caller = rainbowRouter.createCaller(
      makeContext({ session: { uid: "user-1" } })
    );
    await expect(caller.listUnresolved({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("accepts the correct Bearer and runs the query", async () => {
    const prisma = { hash: { findMany: async () => [] } };
    const caller = rainbowRouter.createCaller(
      makeContext({ authorization: `Bearer ${SERVICE_SECRET}`, prisma })
    );
    await expect(caller.listUnresolved({})).resolves.toEqual([]);
  });

  it("rejects resolve() with a non-hex ntHash even with a valid Bearer", async () => {
    const prisma = { hash: { findMany: async () => [] } };
    const caller = rainbowRouter.createCaller(
      makeContext({ authorization: `Bearer ${SERVICE_SECRET}`, prisma })
    );
    await expect(
      caller.resolve({ hash: "whatever", ntHash: "not-32-hex" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
