import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  GetUsersResponse,
  RegisterRequest,
  deleteUser,
  getUsers,
  registerUser,
} from "@repo/api";
import { Checkbox } from "@repo/shadcn/components/ui/checkbox";
import { Input } from "@repo/shadcn/components/ui/input";
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { DataTable } from "@repo/ui/data";
import { Header } from "@repo/ui/header";

export const UsersPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<GetUsersResponse["response"]>([]);

  const [addUser, setAddUser] = useState<RegisterRequest["Body"]>({
    username: "",
    password: "",
    isAdmin: false,
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
          head={["User", "Is Admin?"]}
          values={users}
          row={({ ID, username, isAdmin }) => [
            <TableCell
              className="cursor-pointer font-medium"
              onClick={() => navigate(`/users/${ID}`)}
            >
              {username}
            </TableCell>,
            <TableCell
              className="cursor-pointer"
              onClick={() => navigate(`/users/${ID}`)}
            >
              {isAdmin ? "Yes" : "No"}
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
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isAdmin"
                  checked={addUser.isAdmin}
                  onCheckedChange={(state) =>
                    setAddUser({
                      ...addUser,
                      isAdmin: state === true,
                    })
                  }
                />
                <label
                  htmlFor="isAdmin"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Is Admin?
                </label>
              </div>
            </>
          }
          onAdd={onAdd}
          noRemove
          onRemove={onRemove}
        />
      </div>
    </div>
  );
};
