import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DEFAULT_PERMISSION_PROFILE,
  PERMISSION_PROFILES,
  RegisterRequest,
} from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useLoading } from "@repo/ui/requests";
import { PermissionProfileSelect, useUsers } from "@repo/ui/users";

export const UsersPage = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const {
    users: list,
    loadUsers: loadList,
    addUsers: add,
    removeUsers: remove,
  } = useUsers();

  const [addUserProfile, setAddUserProfile] = useState(
    DEFAULT_PERMISSION_PROFILE
  );
  const [addUser, setAddUser] = useState<RegisterRequest["Body"]>({
    username: "",
    password: "",
    permissions: PERMISSION_PROFILES[DEFAULT_PERMISSION_PROFILE],
  });

  const { getLoading } = useLoading();
  const loading = getLoading("user-many");

  useEffect(() => {
    loadList();
  }, []);

  return (
    <div className="p-4">
      <DataTable
        type="User"
        head={["User"]}
        values={list}
        rowClick={({ ID }) => navigate(`/users/${ID}`)}
        row={({ username }) => [username]}
        loading={loading}
        valueKey={({ ID }) => ID}
        searchFilter={({ username }, search) =>
          username.toLowerCase().includes(search.toLowerCase())
        }
        sort={(a, b) => a.username.localeCompare(b.username)}
        addValidate={() =>
          addUser.username.trim().length > 0 &&
          addUser.password.trim().length > 0
        }
        addDialog={
          <>
            <Input
              placeholder="Username"
              value={addUser.username}
              onChange={(e) =>
                setAddUser({
                  ...addUser,
                  username: e.target.value,
                })
              }
            />
            <Input
              placeholder="Password"
              type="password"
              value={addUser.password}
              onChange={(e) =>
                setAddUser({
                  ...addUser,
                  password: e.target.value,
                })
              }
            />
            <PermissionProfileSelect
              value={addUserProfile}
              onValueChange={(value, permissions) => {
                setAddUserProfile(value);
                setAddUser({
                  ...addUser,
                  permissions,
                });
              }}
            />
          </>
        }
        noAdd={!hasPermission("users:add")}
        onAdd={async () => add(addUser)}
        noRemove
        onRemove={async (users) => remove(...users.map(({ ID }) => ID))}
      />
    </div>
  );
};
