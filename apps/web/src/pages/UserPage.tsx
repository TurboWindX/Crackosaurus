import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, LogOutIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { APIError, PermissionType } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type RES } from "@repo/api/server/client/web";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { PermissionsSelect } from "@repo/ui/users";

interface ProjectDataTableProps {
  values: RES<APIType["getUser"]>["projects"];
  isLoading?: boolean;
}

const ProjectDataTable = ({ values, isLoading }: ProjectDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Project"
      values={values ?? []}
      head={["Project"]}
      rowClick={({ PID }) => navigate(`/projects/${PID}`)}
      row={({ name }) => [name]}
      sort={(a, b) => a.name.localeCompare(b.name)}
      isLoading={isLoading}
      valueKey={({ PID }) => PID}
      searchFilter={({ name }, search) =>
        name.toLowerCase().includes(search.toLowerCase())
      }
    />
  );
};

interface PermissionDataTableProps {
  userID: string;
  values: RES<APIType["getUser"]>["permissions"];
  isLoading?: boolean;
}

const PermissionDataTable = ({
  values,
  isLoading,
  userID,
}: PermissionDataTableProps) => {
  const permissions = useMemo(
    () => (values ?? "").split(" "),
    [values]
  ) as PermissionType[];

  const [selectedPermissions, setSelectedPermissions] = useState<
    PermissionType[]
  >([]);

  const { uid, hasPermission } = useAuth();

  const queryClient = useQueryClient();
  const API = useAPI();
  const { handleError } = useErrors();

  const { mutateAsync: addUserPermissions } = useMutation({
    mutationFn: API.addUserPermissions,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["users", userID],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: removeUserPermissions } = useMutation({
    mutationFn: API.removeUserPermissions,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["users", userID],
      });
    },
    onError: handleError,
  });

  return (
    <DataTable
      type="Permission"
      values={permissions}
      head={["Permission"]}
      row={(permission) => [permission]}
      sort={(a, b) => a.localeCompare(b)}
      isLoading={isLoading}
      valueKey={(permission) => permission}
      searchFilter={(permission, search) =>
        permission.includes(search.toLowerCase())
      }
      addDialog={
        <>
          <PermissionsSelect
            value={selectedPermissions}
            onValueChange={(value) => setSelectedPermissions(value)}
          />
        </>
      }
      onAdd={async () => {
        await addUserPermissions({
          userID,
          permissions: selectedPermissions,
        });

        setSelectedPermissions([]);

        return true;
      }}
      noAdd={!hasPermission("users:edit") || uid === userID}
      addValidate={() => selectedPermissions.length > 0}
      onRemove={async (permissions) => {
        await removeUserPermissions({
          userID,
          permissions,
        });

        return true;
      }}
      noRemove={!hasPermission("users:edit") || uid === userID}
    />
  );
};

interface LogoutButtonProps {
  userID: string;
  isLoading?: boolean;
}

const LogoutButton = ({ userID }: LogoutButtonProps) => {
  const navigate = useNavigate();

  const { uid, logout } = useAuth();

  const queryClient = useQueryClient();

  if (userID !== uid) return <></>;

  return (
    <div className="w-max">
      <Button
        variant="outline"
        onClick={async () => {
          await logout({});

          queryClient.invalidateQueries();

          navigate("/login");
        }}
      >
        <div className="grid grid-flow-col items-center gap-2">
          <LogOutIcon />
          <span>Logout</span>
        </div>
      </Button>
    </div>
  );
};

interface PasswordUpdateButtonProps {
  userID: string;
  isLoading?: boolean;
}

const PasswordUpdateButton = ({
  userID,
  isLoading,
}: PasswordUpdateButtonProps) => {
  const [open, setOpen] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { uid, hasPermission } = useAuth();

  const API = useAPI();
  const { handleError } = useErrors();

  const trigger = useMemo(
    () => (
      <Button variant="outline">
        <div className="grid grid-flow-col items-center gap-2">
          <KeyRoundIcon />
          <span>Password</span>
        </div>
      </Button>
    ),
    []
  );

  const { mutateAsync: changePassword } = useMutation({
    mutationFn: API.changePassword,
    onError: handleError,
  });

  if (!hasPermission("users:edit") && uid !== userID) return <></>;

  if (isLoading) return trigger;

  return (
    <div className="w-max">
      <DrawerDialog
        title="Update Password"
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();

            await changePassword({ userID, oldPassword, newPassword });

            setOpen(false);
            setOldPassword("");
            setNewPassword("");
          }}
        >
          {!hasPermission("users:edit") && (
            <Input
              placeholder="Old Password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          )}
          <Input
            placeholder="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button>Update</Button>
        </form>
      </DrawerDialog>
    </div>
  );
};

interface RemoveButtonProps {
  userID: string;
  user?: RES<APIType["getUser"]>;
  isLoading?: boolean;
}

const RemoveButton = ({ userID, user, isLoading }: RemoveButtonProps) => {
  const [open, setOpen] = useState(false);

  const { uid, hasPermission } = useAuth();

  const navigate = useNavigate();

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: deleteUser } = useMutation({
    mutationFn: API.deleteUser,
    onSuccess() {
      if (uid === userID) {
        queryClient.invalidateQueries();
        navigate("/login");
      } else {
        queryClient.invalidateQueries({ queryKey: ["users", "list"] });
        user?.projects?.forEach(({ PID }) =>
          queryClient.invalidateQueries({ queryKey: ["projects", PID] })
        );

        navigate("/users");
      }
    },
    onError: handleError,
  });

  const trigger = useMemo(
    () => (
      <Button variant="outline">
        <div className="grid grid-flow-col items-center gap-2">
          <TrashIcon />
          <span>Remove</span>
        </div>
      </Button>
    ),
    []
  );

  if (!hasPermission("users:remove") && uid !== userID) return <></>;

  if (isLoading) return trigger;

  return (
    <div className="w-max">
      <DrawerDialog
        title="Remove User"
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();

            await deleteUser({ userID });
          }}
        >
          <span>Do you want to permanently remove this user?</span>
          <Button>Remove</Button>
        </form>
      </DrawerDialog>
    </div>
  );
};

export const UserPage = () => {
  const { userID } = useParams();

  const API = useAPI();
  const { handleError } = useErrors();

  const {
    data: user,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["users", userID],
    queryFn: async () => API.getUser({ userID: userID ?? "" }),
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const tables = useMemo(
    () => [
      <ProjectDataTable
        key="project"
        values={user?.projects ?? []}
        isLoading={isLoading}
      />,
      <PermissionDataTable
        key="permission"
        userID={user?.ID ?? ""}
        values={user?.permissions ?? ""}
        isLoading={isLoading}
      />,
    ],
    [user, isLoading]
  );

  const separatedTables = useMemo(() => {
    const separatedTables = tables
      .filter((value) => value)
      .flatMap((value, i) => [value, <Separator key={i} />]);
    separatedTables.pop();

    return separatedTables;
  }, [tables]);

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {user?.username ?? "Username"}
        </span>
        <div className="grid grid-flow-col justify-end gap-2">
          <LogoutButton userID={userID ?? ""} isLoading={isLoading} />
          <PasswordUpdateButton userID={userID ?? ""} isLoading={isLoading} />
          <RemoveButton
            userID={userID ?? ""}
            user={user}
            isLoading={isLoading}
          />
        </div>
      </div>
      {separatedTables}
    </div>
  );
};
