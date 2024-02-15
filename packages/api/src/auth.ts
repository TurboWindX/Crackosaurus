export const PERMISSIONS = [
  "*",
  "root",
  "hashes:*",
  "hashes:get",
  "hashes:add",
  "hashes:remove",
  "instances:*",
  "instances:get",
  "instances:list",
  "instances:add",
  "instances:remove",
  "instances:start",
  "instances:stop",
  "instances:jobs:*",
  "instances:jobs:get",
  "instances:jobs:add",
  "instances:jobs:remove",
  "projects:*",
  "projects:get",
  "projects:add",
  "projects:remove",
  "projects:users:*",
  "projects:users:get",
  "projects:users:add",
  "projects:users:remove",
  "users:*",
  "users:get",
  "users:list",
  "users:add",
  "users:edit",
  "users:remove",
] as const;
export type PermissionType = (typeof PERMISSIONS)[number];

export const PERMISSION_PROFILES = {
  admin: ["*"],
  contributor: [
    "hashes:*",
    "instances:get",
    "instances:jobs:*",
    "projects:add",
    "projects:remove",
    "projects:users:*",
    "users:list",
  ],
  viewer: ["hashes:get"],
} satisfies Record<string, PermissionType[]>;

export const DEFAULT_PERMISSION_PROFILE: keyof typeof PERMISSION_PROFILES =
  "viewer";
