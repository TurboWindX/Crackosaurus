import { hasPermission, PERMISSION_PROFILES } from "../src/auth";

describe("hasPermission — exact and superuser grants", () => {
  it("grants an exact permission", () => {
    expect(hasPermission("users:get", "users:get")).toBe(true);
  });
  it('"*" grants everything', () => {
    expect(hasPermission("*", "users:remove")).toBe(true);
    expect(hasPermission("*", "auth")).toBe(true);
  });
  it('"root" grants everything', () => {
    expect(hasPermission("root", "wordlists:add")).toBe(true);
  });
  it("denies an unrelated permission", () => {
    expect(hasPermission("hashes:get", "users:add")).toBe(false);
  });
});

describe("hasPermission — hierarchical wildcards", () => {
  it("a leaf wildcard grants its children", () => {
    expect(hasPermission("instances:jobs:*", "instances:jobs:add")).toBe(true);
  });
  it("a higher wildcard grants deeper permissions", () => {
    expect(hasPermission("instances:*", "instances:jobs:add")).toBe(true);
    expect(hasPermission("instances:*", "instances:get")).toBe(true);
  });
  it("a sibling permission is NOT granted by a narrower branch", () => {
    // instances:jobs:add must not imply instances:get
    expect(hasPermission("instances:jobs:add", "instances:get")).toBe(false);
  });
  it("a leaf wildcard does not grant a sibling subtree", () => {
    expect(hasPermission("instances:jobs:*", "instances:get")).toBe(false);
  });
});

describe("hasPermission — input forms", () => {
  it("parses a space-separated permission string", () => {
    expect(hasPermission("auth hashes:get wordlists:get", "hashes:get")).toBe(
      true
    );
    expect(hasPermission("auth hashes:get", "wordlists:add")).toBe(false);
  });
  it("accepts an array of permissions", () => {
    expect(hasPermission(["users:get", "auth"], "users:get")).toBe(true);
  });
  it("treats null/undefined/empty as no permissions", () => {
    expect(hasPermission(null, "auth")).toBe(false);
    expect(hasPermission(undefined, "auth")).toBe(false);
    expect(hasPermission("", "auth")).toBe(false);
  });
});

describe("hasPermission — role profiles", () => {
  it("admin (*) can do anything", () => {
    expect(hasPermission(PERMISSION_PROFILES.admin, "users:remove")).toBe(true);
  });
  it("viewer can read hashes but not add users", () => {
    expect(hasPermission(PERMISSION_PROFILES.viewer, "hashes:get")).toBe(true);
    expect(hasPermission(PERMISSION_PROFILES.viewer, "users:add")).toBe(false);
  });
  it("contributor can request jobs but cannot manage instances directly", () => {
    expect(
      hasPermission(PERMISSION_PROFILES.contributor, "instances:jobs:add")
    ).toBe(true);
    expect(
      hasPermission(PERMISSION_PROFILES.contributor, "instances:remove")
    ).toBe(false);
  });
});
