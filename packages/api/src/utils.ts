import { PermissionType } from ".";

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
