import { cascadeRouter } from "../src/routers/cascadeRouter";
import { projectRouter } from "../src/routers/projectRouter";
import { ruleRouter } from "../src/routers/ruleRouter";
import { settingsRouter } from "../src/routers/settingsRouter";
import { userRouter } from "../src/routers/userRouter";
import { wordlistRouter } from "../src/routers/wordlistRouter";
import { makeContext } from "./helpers";

// permissionProcedure runs its gate as middleware, BEFORE input parsing, so a
// caller with no permissions is rejected with UNAUTHORIZED regardless of input.
// This sweep asserts every sensitive procedure is actually behind a permission.
const noPerms = () => makeContext({ permissions: [] });
const NONE = undefined as never;

describe("router authorization — sensitive procedures reject without permission", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    // userRouter
    ["user.getMany", () => userRouter.createCaller(noPerms()).getMany(NONE)],
    ["user.getList", () => userRouter.createCaller(noPerms()).getList(NONE)],
    ["user.create", () => userRouter.createCaller(noPerms()).create(NONE)],
    [
      "user.addPermissions",
      () => userRouter.createCaller(noPerms()).addPermissions(NONE),
    ],
    [
      "user.removePermissions",
      () => userRouter.createCaller(noPerms()).removePermissions(NONE),
    ],
    [
      "user.deleteMany",
      () => userRouter.createCaller(noPerms()).deleteMany(NONE),
    ],
    // cascadeRouter
    ["cascade.create", () => cascadeRouter.createCaller(noPerms()).create(NONE)],
    ["cascade.delete", () => cascadeRouter.createCaller(noPerms()).delete(NONE)],
    ["cascade.update", () => cascadeRouter.createCaller(noPerms()).update(NONE)],
    // projectRouter
    ["project.create", () => projectRouter.createCaller(noPerms()).create(NONE)],
    [
      "project.deleteMany",
      () => projectRouter.createCaller(noPerms()).deleteMany(NONE),
    ],
    [
      "project.addUsers",
      () => projectRouter.createCaller(noPerms()).addUsers(NONE),
    ],
    [
      "project.removeUsers",
      () => projectRouter.createCaller(noPerms()).removeUsers(NONE),
    ],
    // wordlistRouter
    [
      "wordlist.getUploadUrl",
      () => wordlistRouter.createCaller(noPerms()).getUploadUrl(NONE),
    ],
    [
      "wordlist.deleteMany",
      () => wordlistRouter.createCaller(noPerms()).deleteMany(NONE),
    ],
    [
      "wordlist.completeMultipartUpload",
      () =>
        wordlistRouter.createCaller(noPerms()).completeMultipartUpload(NONE),
    ],
    // ruleRouter
    [
      "rule.deleteMany",
      () => ruleRouter.createCaller(noPerms()).deleteMany(NONE),
    ],
    // settingsRouter (root-only)
    [
      "settings.setMaxInstanceLife",
      () => settingsRouter.createCaller(noPerms()).setMaxInstanceLife(NONE),
    ],
  ];

  it.each(cases)("%s → UNAUTHORIZED", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("settingsRouter — max-instance-life input bounds (root)", () => {
  const root = () =>
    settingsRouter.createCaller(makeContext({ permissions: ["root"] }));

  it("rejects hours above the ceiling", async () => {
    await expect(
      root().setMaxInstanceLife({ hours: 1_000_000 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects negative hours", async () => {
    await expect(
      root().setMaxInstanceLife({ hours: -1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
