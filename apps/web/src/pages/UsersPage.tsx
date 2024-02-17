import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  APIError,
  DEFAULT_PERMISSION_PROFILE,
  PERMISSION_PROFILES,
} from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type REQ } from "@repo/api/server/client/web";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { PermissionProfileSelect } from "@repo/ui/users";

export const UsersPage = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [addUserProfile, setAddUserProfile] = useState(
    DEFAULT_PERMISSION_PROFILE
  );

  const [newUser, setNewUser] = useState<REQ<APIType["register"]>>({
    username: "",
    password: "",
    permissions: PERMISSION_PROFILES[DEFAULT_PERMISSION_PROFILE],
  });

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const {
    data: users,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["users", "list", "page"],
    queryFn: API.getUsers,
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: register } = useMutation({
    mutationFn: API.register,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["users", "list"],
      });
    },
    onError: handleError,
  });

  return (
    <div className="p-4">
      <DataTable
        type="User"
        head={["User"]}
        values={users ?? []}
        rowClick={({ ID }) => navigate(`/users/${ID}`)}
        row={({ username }) => [username]}
        isLoading={isLoading}
        valueKey={({ ID }) => ID}
        searchFilter={({ username }, search) =>
          username.toLowerCase().includes(search.toLowerCase())
        }
        sort={(a, b) => a.username.localeCompare(b.username)}
        addValidate={() =>
          newUser.username.trim().length > 0 &&
          newUser.password.trim().length > 0
        }
        addDialog={
          <>
            <Input
              placeholder="Username"
              value={newUser.username}
              onChange={(e) =>
                setNewUser({
                  ...newUser,
                  username: e.target.value,
                })
              }
            />
            <Input
              placeholder="Password"
              type="password"
              value={newUser.password}
              onChange={(e) =>
                setNewUser({
                  ...newUser,
                  password: e.target.value,
                })
              }
            />
            <PermissionProfileSelect
              value={addUserProfile}
              onValueChange={(value, permissions) => {
                setAddUserProfile(value);
                setNewUser({
                  ...newUser,
                  permissions,
                });
              }}
            />
          </>
        }
        noAdd={!hasPermission("users:add")}
        onAdd={async () => {
          await register(newUser);
          return true;
        }}
      />
    </div>
  );
};
