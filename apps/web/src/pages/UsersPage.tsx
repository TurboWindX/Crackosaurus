import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DEFAULT_PERMISSION_PROFILE,
  GetUsersResponse,
  PERMISSION_PROFILES,
  RegisterRequest,
  deleteUser,
  getUsers,
  registerUser,
} from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { Header } from "@repo/ui/header";
import { PermissionProfileSelect } from "@repo/ui/users";

export const UsersPage = () => {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<GetUsersResponse["response"]>([]);

  const [addUserProfile, setAddUserProfile] = useState(
    DEFAULT_PERMISSION_PROFILE
  );
  const [addUser, setAddUser] = useState<RegisterRequest["Body"]>({
    username: "",
    password: "",
    permissions: PERMISSION_PROFILES[DEFAULT_PERMISSION_PROFILE],
  });

  async function refreshUsers() {
    const res = await getUsers();

    if (res.response) setUsers(res.response);
  }

  async function handleResponse({
    response,
    error,
  }: {
    response?: string;
    error?: string;
  }): Promise<boolean> {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error,
      });

      return false;
    }

    await refreshUsers();

    toast({
      variant: "default",
      title: "Success",
      description: response,
    });

    return true;
  }

  async function onAdd(): Promise<boolean> {
    return await handleResponse(await registerUser(addUser));
  }

  async function onRemove(
    users: GetUsersResponse["response"]
  ): Promise<boolean> {
    let res = { response: "", error: "" };
    for (let { ID } of users) {
      const result = await deleteUser(ID);

      if (!res.error) res = result;
    }

    return await handleResponse(res);
  }

  useEffect(() => {
    refreshUsers();
  }, []);

  return (
    <div>
      <Header />
      <div className="p-4">
        <DataTable
          type="User"
          head={["User"]}
          values={users}
          row={({ ID, username }) => [
            <TableCell
              className="cursor-pointer font-medium"
              onClick={() => navigate(`/users/${ID}`)}
            >
              {username}
            </TableCell>,
          ]}
          valueKey={({ ID }) => ID}
          searchFilter={({ username }, search) =>
            username.toLowerCase().includes(search.toLowerCase())
          }
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
          onAdd={onAdd}
          noRemove
          onRemove={onRemove}
        />
      </div>
    </div>
  );
};
