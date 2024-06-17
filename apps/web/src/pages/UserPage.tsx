import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { APIError, PermissionType } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type RES } from "@repo/api/server/client/web";
import { Button } from "@repo/shadcn/components/ui/button";
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

export const UserPage = () => {
  const { userID } = useParams();

  const { uid, hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  const [removeOpen, setRemoveOpen] = useState(false);

  const API = useAPI();
  const queryClient = useQueryClient();
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

  const { mutateAsync: deleteUser } = useMutation({
    mutationFn: async (userID: string) => API.deleteUser({ userID }),
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

  const tables = [
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
  ];

  const separatedTables = tables
    .filter((value) => value)
    .flatMap((value, i) => [value, <Separator key={i} />]);
  separatedTables.pop();

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {user?.username ?? "Username"}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {uid.toString() === userID && (
            <div className="w-max">
              <Button
                variant="outline"
                onClick={async () => {
                  navigate("/login");

                  await logout({});
                }}
              >
                <div className="grid grid-flow-col items-center gap-2">
                  <LogOutIcon />
                  <span>Logout</span>
                </div>
              </Button>
            </div>
          )}
          {(hasPermission("users:remove") || uid === userID) && (
            <div className="w-max">
              <DrawerDialog
                title="Remove User"
                open={removeOpen}
                setOpen={setRemoveOpen}
                trigger={
                  <Button variant="outline">
                    <div className="grid grid-flow-col items-center gap-2">
                      <TrashIcon />
                      <span>Remove</span>
                    </div>
                  </Button>
                }
              >
                <form
                  className="grid gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault();

                    await deleteUser(userID ?? "");
                  }}
                >
                  <span>Do you want to permanently remove this user?</span>
                  <Button>Remove</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
        </div>
      </div>
      {separatedTables}
    </div>
  );
};
