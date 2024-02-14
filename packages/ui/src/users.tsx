import { createContext, useContext, useEffect, useState } from "react";

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
  SelectItem,
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
      onValueChange={(value) => onValueChange?.(value)}
    >
      <SelectTrigger>
        <SelectValue placeholder="User" />
      </SelectTrigger>
      <SelectContent>
        {users
          .filter((user) => filter?.(user) ?? true)
          .map(({ ID, username }) => (
            <SelectItem key={username} value={ID}>
              {username}
            </SelectItem>
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
          <SelectItem key={key} value={key}>
            {key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export interface UsersInterface {
  readonly isLoading: boolean;

  readonly addUsers: (...reqs: RegisterRequest["Body"][]) => Promise<boolean>;
  readonly removeUsers: (...ids: string[]) => Promise<boolean>;

  readonly user: GetUserResponse["response"] | null;
  readonly loadUser: (id: string) => Promise<void>;

  readonly users: GetUsersResponse["response"];
  readonly loadUsers: () => Promise<void>;
}

const UsersContext = createContext<UsersInterface>({
  isLoading: true,
  user: null,
  users: [],
  addUsers: async () => false,
  removeUsers: async () => false,
  loadUser: async () => {},
  loadUsers: async () => {},
});

export function useUsers() {
  return useContext(UsersContext);
}

export const UsersProvider = ({ children }: { children: any }) => {
  const { handleRequests } = useRequests();

  const {
    isLoading,
    one: user,
    list: users,
    loadOne: loadUser,
    loadList: loadUsers,
    refreshList,
  } = useLoader(getUser, getUsers);

  const value: UsersInterface = {
    isLoading,
    user,
    loadUser,
    users,
    loadUsers,
    addUsers: async (...reqs) => {
      const _results = await handleRequests("User(s) added", reqs, (req) =>
        registerUser(req)
      );

      await refreshList();

      return true;
    },
    removeUsers: async (...ids) => {
      const _results = await handleRequests("User(s) removed", ids, (id) =>
        deleteUser(id)
      );

      await refreshList();

      return true;
    },
  };

  return (
    <UsersContext.Provider value={value}>{children}</UsersContext.Provider>
  );
};
