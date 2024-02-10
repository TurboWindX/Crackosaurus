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

import { useAuth } from "./auth";
import { useRequests } from "./requests";

const DEFAULT_ONE: GetUserResponse["response"] = {
  ID: "",
  username: "username",
  permissions: "",
};

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

  readonly add: (...reqs: RegisterRequest["Body"][]) => Promise<boolean>;
  readonly remove: (...ids: string[]) => Promise<boolean>;

  readonly one: GetUserResponse["response"];
  readonly loadOne: (id: string) => Promise<void>;

  readonly list: GetUsersResponse["response"];
  readonly loadList: () => Promise<void>;
}

const UsersContext = createContext<UsersInterface>({
  isLoading: true,
  one: DEFAULT_ONE,
  list: [],
  add: async () => false,
  remove: async () => false,
  loadOne: async () => {},
  loadList: async () => {},
});

export function useUsers() {
  return useContext(UsersContext);
}

export const UsersProvider = ({ children }: { children: any }) => {
  const { invalidate } = useAuth();
  const { handleRequests } = useRequests();

  const [isLoading, setLoading] = useState(false);
  const [cache, setCache] = useState<
    Record<string, GetUserResponse["response"]>
  >({});

  const [id, setID] = useState<string>("");
  const [list, setList] = useState<GetUsersResponse["response"]>([]);
  const [listLoaded, setListLoaded] = useState(false);

  async function reloadOne(id: string): Promise<boolean> {
    setLoading(true);

    const { response, error } = await getUser(id);
    if (response) {
      setCache({
        ...cache,
        [id]: response,
      });
      setID(id);
    } else if (error.code === 401) invalidate();

    setLoading(false);

    return response !== undefined;
  }

  async function reloadList() {
    setLoading(true);

    const { response, error } = await getUsers();
    if (response) setList(response);
    else if (error.code === 401) invalidate();

    setLoading(false);
  }

  const value: UsersInterface = {
    isLoading,
    one: cache[id] ?? {
      ID: "",
      username: "username",
      permissions: "",
    },
    list,
    add: async (...reqs) => {
      const _results = await handleRequests("User(s) added", reqs, (req) =>
        registerUser(req)
      );

      await reloadList();

      return true;
    },
    remove: async (...ids) => {
      const results = await handleRequests("User(s) removed", ids, (id) =>
        deleteUser(id)
      );

      setList(
        list.filter(({ ID }) =>
          results.every(([id, { error }]) => ID !== id || error)
        )
      );

      return true;
    },
    loadOne: async (id: string) => {
      setLoading(true);

      if (cache[id] || (await reloadOne(id))) setID(id);

      setLoading(false);
    },
    loadList: async () => {
      setLoading(true);

      if (!listLoaded) await reloadList();
      setListLoaded(true);

      setLoading(false);
    },
  };

  return (
    <UsersContext.Provider value={value}>{children}</UsersContext.Provider>
  );
};
