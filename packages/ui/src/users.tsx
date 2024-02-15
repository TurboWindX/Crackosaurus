import { createContext, useContext, useEffect, useMemo } from "react";

import {
  GetUserListResponse,
  GetUserResponse,
  GetUsersResponse,
  PERMISSION_PROFILES,
  PermissionType,
  RegisterRequest,
  deleteUser,
  getUser,
  getUserList,
  getUsers,
  registerUser,
} from "@repo/api";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

import { useLoader, useRequests } from "./requests";

export interface UserSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
  filter?: (user: GetUserListResponse["response"][number]) => boolean;
}

export const UserSelect = ({
  value,
  onValueChange,
  filter,
}: UserSelectProps) => {
  const { userList, loadUserList } = useUsers();

  useEffect(() => {
    loadUserList();
  }, []);

  const filteredUserList = useMemo(
    () => userList.filter((user) => filter?.(user) ?? true),
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

export interface UsersInterface {
  readonly loading: boolean;

  readonly addUsers: (...reqs: RegisterRequest["Body"][]) => Promise<boolean>;
  readonly removeUsers: (...ids: string[]) => Promise<boolean>;

  readonly user: GetUserResponse["response"] | null;
  readonly loadUser: (id: string) => Promise<void>;

  readonly users: GetUsersResponse["response"];
  readonly loadUsers: () => Promise<void>;

  readonly userList: GetUserListResponse["response"];
  readonly loadUserList: () => Promise<void>;
}

const UsersContext = createContext<UsersInterface>({
  loading: true,
  user: null,
  users: [],
  userList: [],
  addUsers: async () => false,
  removeUsers: async () => false,
  loadUser: async () => {},
  loadUsers: async () => {},
  loadUserList: async () => {},
});

export function useUsers() {
  return useContext(UsersContext);
}

export const UsersProvider = ({ children }: { children: any }) => {
  const { handleRequests } = useRequests();

  const {
    loading,
    one: user,
    many: users,
    list: userList,
    loadOne: loadUser,
    loadMany: loadUsers,
    loadList: loadUserList,
    refresh: refreshUsers,
  } = useLoader({
    getID: ({ ID }) => ID,
    loadOne: getUser,
    loadMany: getUsers,
    loadList: getUserList,
  });

  const value: UsersInterface = {
    loading,
    user,
    loadUser,
    users,
    loadUsers,
    userList,
    loadUserList,
    addUsers: async (...reqs) => {
      const _results = await handleRequests("User(s) added", reqs, (req) =>
        registerUser(req)
      );

      await refreshUsers({
        add: [],
      });

      return true;
    },
    removeUsers: async (...ids) => {
      const results = await handleRequests("User(s) removed", ids, (id) =>
        deleteUser(id)
      );

      await refreshUsers({
        remove: results.filter(([_, res]) => !res.error).map(([id]) => id),
      });

      return true;
    },
  };

  return (
    <UsersContext.Provider value={value}>{children}</UsersContext.Provider>
  );
};
