import { useEffect, useState } from "react";

import {
  GetUserListResponse,
  PERMISSION_PROFILES,
  PermissionType,
  getUserList,
} from "@repo/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

export interface UserSelectProps {
  value?: number | null;
  onValueChange?: (value: number) => void;
  filter?: (user: GetUserListResponse["response"][number]) => boolean;
}

export const UserSelect = ({
  value,
  onValueChange,
  filter,
}: UserSelectProps) => {
  const [users, setUsers] = useState<GetUserListResponse["response"]>([]);

  async function refreshUsers() {
    const { response } = await getUserList();

    if (response) setUsers(response);
  }

  useEffect(() => {
    refreshUsers();
  }, []);

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(parseInt(value))}
    >
      <SelectTrigger>
        <SelectValue placeholder="User" />
      </SelectTrigger>
      <SelectContent>
        {users
          .filter((user) => filter?.(user) ?? true)
          .map(({ ID, username }) => (
            <SelectItem value={ID.toString()}>{username}</SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
};

export interface PermissionProfileSelectProps {
  value?: keyof typeof PERMISSION_PROFILES;
  onValueChange?: (
    value: keyof typeof PERMISSION_PROFILES,
    permissions: PermissionType[]
  ) => void;
}

export const PermissionProfileSelect = ({
  value,
  onValueChange,
}: PermissionProfileSelectProps) => {
  return (
    <Select
      value={value}
      onValueChange={(value) =>
        onValueChange?.(
          value as keyof typeof PERMISSION_PROFILES,
          PERMISSION_PROFILES[value as keyof typeof PERMISSION_PROFILES]
        )
      }
    >
      <SelectTrigger>
        <SelectValue placeholder="User" />
      </SelectTrigger>
      <SelectContent>
        {Object.keys(PERMISSION_PROFILES).map((key) => (
          <SelectItem value={key}>{key}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
