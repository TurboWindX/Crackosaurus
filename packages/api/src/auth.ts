export const PERMISSIONS = [
  "*",
  "auth",
  "root",
  "hashes:*",
  "hashes:view",
  "hashes:get",
  "hashes:add",
  "hashes:remove",
  "instances:*",
  "instances:get",
  "instances:list",
  "instances:add",
  "instances:remove",
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
  "wordlists:*",
  "wordlists:get",
  "wordlists:list",
  "wordlists:add",
  "wordlists:remove",
] as const;
export type PermissionType = (typeof PERMISSIONS)[number];

export const PERMISSION_PROFILES = {
  admin: ["*"],
  contributor: [
    "auth",
    "hashes:*",
    "instances:get",
    "instances:jobs:*",
    "projects:add",
    "projects:remove",
    "projects:users:*",
    "users:list",
    "wordlists:get",
    "wordlists:list",
  ],
  viewer: ["auth", "hashes:get"],
} satisfies Record<string, PermissionType[]>;

export const DEFAULT_PERMISSION_PROFILE: keyof typeof PERMISSION_PROFILES =
  "viewer";

export function hasPermission(
  permissions: undefined | null | string | PermissionType[],
  permission: PermissionType
) {
  const permissionSet = Array.isArray(permissions)
    ? new Set(permissions)
    : new Set<PermissionType>(
        (permissions ?? "").split(" ") as PermissionType[]
      );

  if (permissionSet.has(permission) || permissionSet.has("root")) return true;

  const permissionSections = permission.split(":");

  while (permissionSections.length > 0) {
    permissionSections.pop();
    permissionSections.push("*");

    if (permissionSet.has(permissionSections.join(":") as PermissionType))
      return true;

    permissionSections.pop();
  }

  return false;
}
