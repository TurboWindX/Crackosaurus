import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { DEFAULT_PERMISSION_PROFILE, PERMISSION_PROFILES } from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { tRPCInput, useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { RelativeTime } from "@repo/ui/time";
import { PermissionProfileSelect } from "@repo/ui/users";

export const UsersPage = () => {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [addUserProfile, setAddUserProfile] = useState(
    DEFAULT_PERMISSION_PROFILE
  );

  const [newUser, setNewUser] = useState<tRPCInput["user"]["create"]>({
    username: "",
    password: "",
    permissions: PERMISSION_PROFILES[DEFAULT_PERMISSION_PROFILE],
  });

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.user.getMany, undefined, "any"),
      getQueryKey(trpc.user.getList, undefined, "any"),
    ],
    []
  );

  const {
    data: users,
    isLoading,
    error,
    isLoadingError,
  } = trpc.user.getMany.useQuery(undefined, {
    retry(count, error) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      )
        return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: createUser } = trpc.user.create.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const { mutateAsync: deleteUsers } = trpc.user.deleteMany.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  return (
    <div className="p-4">
      <DataTable
        singular={t("item.user.singular")}
        plural={t("item.user.plural")}
        head={[t("item.user.singular"), t("item.time.update")]}
        values={users ?? []}
        rowClick={({ ID }) => navigate(`/users/${ID}`)}
        row={({ username, updatedAt }) => [
          username,
          <RelativeTime time={updatedAt} />,
        ]}
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
              placeholder={t("item.username.singular")}
              value={newUser.username}
              onChange={(e) =>
                setNewUser({
                  ...newUser,
                  username: e.target.value,
                })
              }
            />
            <Input
              placeholder={t("item.password.singular")}
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
          await createUser(newUser);

          setNewUser({ ...newUser, username: "", password: "" });

          return true;
        }}
        noRemove={!hasPermission("root")}
        onRemove={async (users) => {
          await deleteUsers({
            userIDs: users.map((user) => user.ID),
          });

          return true;
        }}
      />
    </div>
  );
};
