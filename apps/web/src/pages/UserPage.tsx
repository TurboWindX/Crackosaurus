import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { t } from "i18next";
import { KeyRoundIcon, LogOutIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { PermissionType } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { tRPCOutput, trpc } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { PermissionsSelect } from "@repo/ui/users";

interface ProjectDataTableProps {
  values: tRPCOutput["user"]["get"]["projects"];
  isLoading?: boolean;
}

const ProjectDataTable = ({ values, isLoading }: ProjectDataTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DataTable
      singular={t("item.project.singular")}
      plural={t("item.project.plural")}
      values={values ?? []}
      head={[t("item.project.singular")]}
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
  values: tRPCOutput["user"]["get"]["permissions"];
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
  const { handleError } = useErrors();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.user.get, {
        userID,
      }),
      getQueryKey(trpc.user.getMany),
      getQueryKey(trpc.user.getList),
    ],
    []
  );

  const { mutateAsync: addUserPermissions } =
    trpc.user.addPermissions.useMutation({
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      },
      onError: handleError,
    });

  const { mutateAsync: removeUserPermissions } =
    trpc.user.removePermissions.useMutation({
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      },
      onError: handleError,
    });

  return (
    <DataTable
      singular={t("item.permission.singular")}
      plural={t("item.permission.plural")}
      values={permissions}
      head={[t("item.permission.singular")]}
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
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { uid } = useAuth();

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: logout } = trpc.auth.logout.useMutation({
    onSuccess() {
      queryClient.invalidateQueries();
      navigate("/login");
    },
    onError: handleError,
  });

  if (userID !== uid) return <></>;

  return (
    <div className="w-max">
      <Button
        variant="outline"
        onClick={async () => {
          await logout();
        }}
      >
        <div className="grid grid-flow-col items-center gap-2">
          <LogOutIcon />
          <span>{t("action.logout.text")}</span>
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { uid, hasPermission } = useAuth();

  const { handleError } = useErrors();

  const trigger = useMemo(
    () => (
      <Button variant="outline">
        <div className="grid grid-flow-col items-center gap-2">
          <KeyRoundIcon />
          <span>{t("item.password.singular")}</span>
        </div>
      </Button>
    ),
    []
  );

  const { mutateAsync: updatePassword } = trpc.user.updatePassword.useMutation({
    onError: handleError,
  });

  if (!hasPermission("users:edit") && uid !== userID) return <></>;

  if (isLoading) return trigger;

  return (
    <div className="w-max">
      <DrawerDialog
        title={t("action.update.item", { item: t("item.password.singular") })}
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      >
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();

            await updatePassword({ userID, oldPassword, newPassword });

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
            placeholder={t("item.password.singular")}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button>{t("action.update.text")}</Button>
        </form>
      </DrawerDialog>
    </div>
  );
};

interface RemoveButtonProps {
  userID: string;
  user?: tRPCOutput["user"]["get"];
  isLoading?: boolean;
}

const RemoveButton = ({ userID, user, isLoading }: RemoveButtonProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { uid, hasPermission } = useAuth();

  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: deleteUsers } = trpc.user.deleteMany.useMutation({
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
          <span>{t("action.remove.text")}</span>
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
        title={t("action.remove.item", { item: t("item.user.singular") })}
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      >
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();

            await deleteUsers({
              userIDs: [userID],
            });
          }}
        >
          <span>
            {t("action.remove.warn", {
              item: t("item.user.singular").toLowerCase(),
            })}
          </span>
          <Button>{t("action.remove.text")}</Button>
        </form>
      </DrawerDialog>
    </div>
  );
};

export const UserPage = () => {
  const { userID } = useParams();

  const { handleError } = useErrors();

  const {
    data: user,
    isLoading,
    error,
    isLoadingError,
  } = trpc.user.get.useQuery(
    { userID: userID! },
    {
      retry(count, error) {
        if (
          error instanceof TRPCClientError &&
          error.data?.code === "UNAUTHORIZED"
        )
          return false;
        return count < 3;
      },
    }
  );

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
    <div className="grid gap-4 p-4">
      <div className="flex gap-2">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {user?.username ?? "Username"}
        </span>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
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
