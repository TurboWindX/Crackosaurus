import { createContext, useContext, useEffect, useState } from "react";

import {
  ApiError,
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
import { useToast } from "@repo/shadcn/components/ui/use-toast";

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
            <SelectItem key={username} value={ID.toString()}>
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
  add: async () => false,
  remove: async () => false,
  one: {
    ID: "",
    username: "username",
    permissions: "",
  },
  loadOne: async () => {},
  list: [],
  loadList: async () => {},
});

export function useUsers() {
  return useContext(UsersContext);
}

export const UsersProvider = ({ children }: { children: any }) => {
  const { toast } = useToast();
  const [isLoading, setLoading] = useState(false);
  const [id, setID] = useState<string>("");
  const [cache, setCache] = useState<
    Record<string, GetUserResponse["response"]>
  >({});
  const [list, setList] = useState<GetUsersResponse["response"]>([]);
  const [listLoaded, setListLoaded] = useState(false);

  async function reloadOne(id: string): Promise<boolean> {
    setLoading(true);

    const { response, error } = await getUser(id);
    if (!error) {
      setCache({
        ...cache,
        [id]: response,
      });
      setID(id);
    }

    setLoading(false);

    return error !== undefined;
  }

  async function reloadList() {
    setLoading(true);

    const { response, error } = await getUsers();
    if (!error) setList(response);

    setLoading(false);
  }

  async function handleRequests<T, R extends ApiError>(
    message: string,
    values: T[],
    callback: (value: T) => Promise<R>
  ): Promise<(readonly [T, R])[]> {
    const results = await Promise.all(
      values.map(async (value) => [value, await callback(value)] as const)
    );
    if (!handleErrors(results)) return results;

    handleSuccess(message);

    return results;
  }

  function handleSuccess(message: string) {
    toast({
      variant: "default",
      title: "Success",
      description: message,
    });
  }

  function handleErrors(results: (readonly [any, ApiError])[]): boolean {
    const errors = results
      .map(([_, { error }]) => error)
      .filter((error) => error != null);

    if (errors.length === 0) return true;

    toast({
      variant: "destructive",
      title: "Error",
      description: errors.join(", "),
    });

    return false;
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
