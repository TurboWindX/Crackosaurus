import bcrypt from "bcrypt";

import { authRouter } from "../src/routers/authRouter";
import { makeContext } from "./helpers";

const PASSWORD_HASH = bcrypt.hashSync("correct-horse", 4);

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    ID: "user-1",
    username: "alice",
    permissions: "auth",
    password: PASSWORD_HASH,
    mfaEnabled: false,
    totpSecret: null,
    lockedUntil: null,
    ...overrides,
  };
}

describe("authRouter.login", () => {
  it("rejects a non-existent user with a generic BAD_REQUEST (no enumeration)", async () => {
    const prisma = { user: { findUnique: async () => null } };
    const caller = authRouter.createCaller(makeContext({ prisma }));
    await expect(
      caller.login({ username: "ghost", password: "whatever" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a wrong password and records a failed attempt", async () => {
    const updates: unknown[] = [];
    const prisma = {
      user: {
        findUnique: async () => userRow(),
        update: async (args: unknown) => {
          updates.push(args);
          return { failedLoginAttempts: 1 };
        },
      },
    };
    const caller = authRouter.createCaller(makeContext({ prisma }));
    await expect(
      caller.login({ username: "alice", password: "WRONG" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates.length).toBeGreaterThanOrEqual(1); // failed-attempt increment
  });

  it("rejects a locked account with the same generic error", async () => {
    const prisma = {
      user: {
        findUnique: async () =>
          userRow({ lockedUntil: new Date(Date.now() + 60_000) }),
      },
    };
    const caller = authRouter.createCaller(makeContext({ prisma }));
    await expect(
      caller.login({ username: "alice", password: "correct-horse" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("establishes a session on correct password (no MFA)", async () => {
    const prisma = {
      user: {
        findUnique: async () => userRow(),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const session: Record<string, unknown> = { regenerate: async () => {} };
    const caller = authRouter.createCaller(makeContext({ prisma, session }));
    await expect(
      caller.login({ username: "alice", password: "correct-horse" })
    ).resolves.toMatchObject({ status: "OK", uid: "user-1" });
    expect(session.uid).toBe("user-1");
  });
});

describe("authRouter.logout", () => {
  it("requires the auth permission", async () => {
    const caller = authRouter.createCaller(makeContext({ permissions: [] }));
    await expect(caller.logout()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
