import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  PERMISSIONS,
  PERMISSION_PROFILES,
  type PermissionType,
} from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type RES } from "@repo/api/server/client/web";
import { MultiSelect } from "@repo/shadcn/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
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
  const { t } = useTranslation();
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
      disabled={filteredUserList.length === 0}
    >
      <SelectTrigger>
        <SelectValue placeholder={t("item.user.singular")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
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

export interface PermissionsSelectProps {
  value?: PermissionType[];
  onValueChange?: (value: PermissionType[]) => void;
}

export const PermissionsSelect = ({
  value,
  onValueChange,
}: PermissionsSelectProps) => {
  const { t } = useTranslation();

  return (
    <MultiSelect
      label={t("item.permission.plural")}
      values={PERMISSIONS.map((permission) => [permission, permission])}
      selectedValues={value ?? []}
      onValueChange={(value) => onValueChange?.(value as PermissionType[])}
    />
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
  const { t } = useTranslation();

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
        <SelectValue placeholder={t("item.profile.singular")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
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
