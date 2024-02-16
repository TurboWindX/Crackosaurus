import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { PERMISSION_PROFILES, type PermissionType } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type RES } from "@repo/api/server/client/web";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

import { useAPI } from "./api";

export interface UserSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
  filter?: (user: RES<APIType["getUserList"]>[number]) => boolean;
}

export const UserSelect = ({
  value,
  onValueChange,
  filter,
}: UserSelectProps) => {
  const API = useAPI();

  const { data: userList } = useQuery({
    queryKey: ["users", "list", "component"],
    queryFn: API.getUserList,
  });

  const filteredUserList = useMemo(
    () => (userList ?? []).filter((user) => filter?.(user) ?? true),
    [userList, filter]
  );

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
    >
      <SelectTrigger>
        <SelectValue placeholder="User" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>User</SelectLabel>
          {filteredUserList.map(({ ID, username }) => (
            <SelectItem key={username} value={ID}>
              {username}
            </SelectItem>
          ))}
        </SelectGroup>
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
        <SelectGroup>
          <SelectLabel>User</SelectLabel>
          {Object.keys(PERMISSION_PROFILES).map((key) => (
            <SelectItem key={key} value={key}>
              {key}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
