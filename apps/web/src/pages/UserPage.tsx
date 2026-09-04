import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { t } from "i18next";
import {
  KeyRoundIcon,
  LogOutIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { PermissionType } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { tRPCOutput, useTRPC } from "@repo/ui/api";
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
  const trpc = useTRPC();

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const queryKeys = useMemo(
    () => [
      getQueryKey(
        trpc.user.get,
        {
          userID,
        },
        "any"
      ),
      getQueryKey(trpc.user.getMany, undefined, "any"),
      getQueryKey(trpc.user.getList, undefined, "any"),
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
  const trpc = useTRPC();

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

// Mirrors the server-side MIN_PASSWORD_LENGTH policy (apps/server .../utils/
// password.ts). Kept in sync manually; the server still enforces it — this is
// only a client-side hint so the user sees the requirement before submitting.
const MIN_PASSWORD_LENGTH = 15;

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
  const trpc = useTRPC();

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
        title={t("action.update.item", {
          item: t("item.password.singular").toLowerCase(),
        })}
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      >
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();

            // Guard client-side too so a too-short password never round-trips
            // to a BAD_REQUEST; the server still enforces the same minimum.
            if (newPassword.length < MIN_PASSWORD_LENGTH) return;

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
          <p className="text-muted-foreground text-xs">
            {t("password.minLength", {
              defaultValue: `Must be at least ${MIN_PASSWORD_LENGTH} characters.`,
              count: MIN_PASSWORD_LENGTH,
            })}
          </p>
          <Button disabled={newPassword.length < MIN_PASSWORD_LENGTH}>
            {t("action.update.text")}
          </Button>
        </form>
      </DrawerDialog>
    </div>
  );
};

interface MfaButtonProps {
  userID: string;
  mfaEnabled?: boolean;
  isLoading?: boolean;
}

const MfaButton = ({ userID, mfaEnabled, isLoading }: MfaButtonProps) => {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  // Enrollment is a small state machine: pick "Set up" -> scan QR & confirm a
  // code -> save the one-time recovery codes.
  const [step, setStep] = useState<"idle" | "enrolling" | "recovery">("idle");
  const [enroll, setEnroll] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const { uid } = useAuth();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const invalidate = () =>
    queryClient.invalidateQueries(
      getQueryKey(trpc.user.get, { userID }, "any")
    );

  const { mutateAsync: startMfaEnrollment } =
    trpc.user.startMfaEnrollment.useMutation({ onError: handleError });
  // Refresh mfaEnabled the moment the server state flips, independent of how the
  // dialog is later dismissed — otherwise a backdrop/Escape close leaves the
  // cached flag stale and the wrong (enroll vs disable) form shows.
  const { mutateAsync: confirmMfaEnrollment } =
    trpc.user.confirmMfaEnrollment.useMutation({
      onSuccess: invalidate,
      onError: handleError,
    });
  const { mutateAsync: disableMfa } = trpc.user.disableMfa.useMutation({
    onSuccess: invalidate,
    onError: handleError,
  });

  const reset = () => {
    setStep("idle");
    setEnroll(null);
    setCode("");
    setPassword("");
    setRecoveryCodes([]);
  };

  const trigger = useMemo(
    () => (
      <Button variant="outline">
        <div className="grid grid-flow-col items-center gap-2">
          <ShieldCheckIcon />
          <span>{t("mfa.title", { defaultValue: "Two-factor auth" })}</span>
        </div>
      </Button>
    ),
    []
  );

  // 2FA is personal: only the account owner manages their own second factor.
  if (uid !== userID) return <></>;

  if (isLoading) return trigger;

  return (
    <div className="w-max">
      <DrawerDialog
        title={t("mfa.title", { defaultValue: "Two-factor authentication" })}
        open={open}
        setOpen={(value) => {
          setOpen(value);
          if (!value) reset();
        }}
        trigger={trigger}
        // On the recovery step the codes are shown exactly once and cannot be
        // re-fetched. Block backdrop/Escape dismissal so they can only be left
        // via the explicit "I've saved my codes" button, preventing accidental
        // loss (which would strand the account with 2FA on and no codes).
        preventClose={step === "recovery"}
      >
        {/* Already enabled: offer to disable (password-gated). */}
        {mfaEnabled && step === "idle" && (
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                // onSuccess invalidates mfaEnabled; only close on success so a
                // wrong password (surfaced by onError) leaves the form open.
                await disableMfa({ password });
                setOpen(false);
                reset();
              } catch {
                // Surfaced by the mutation's onError handler.
              }
            }}
          >
            <p className="text-muted-foreground text-sm">
              {t("mfa.disablePrompt", {
                defaultValue:
                  "Enter your password to disable two-factor authentication.",
              })}
            </p>
            <Input
              type="password"
              placeholder={t("item.password.singular")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button variant="destructive">
              {t("mfa.disable", { defaultValue: "Disable 2FA" })}
            </Button>
          </form>
        )}

        {/* Not enabled: begin enrollment. */}
        {!mfaEnabled && step === "idle" && (
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const data = await startMfaEnrollment();
                setEnroll({ secret: data.secret, qrDataUrl: data.qrDataUrl });
                setStep("enrolling");
              } catch {
                // Surfaced by the mutation's onError handler.
              }
            }}
          >
            <p className="text-muted-foreground text-sm">
              {t("mfa.enroll.intro", {
                defaultValue:
                  "Protect your account with a time-based code from an authenticator app.",
              })}
            </p>
            <Button>{t("mfa.enable", { defaultValue: "Enable 2FA" })}</Button>
          </form>
        )}

        {/* Scan QR + confirm a live code. */}
        {step === "enrolling" && enroll && (
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { recoveryCodes } = await confirmMfaEnrollment({ code });
                setRecoveryCodes(recoveryCodes);
                setStep("recovery");
              } catch {
                // Surfaced by the mutation's onError handler; stay on this step
                // so the user can retry the code.
              }
            }}
          >
            <p className="text-muted-foreground text-sm">
              {t("mfa.enroll.scan", {
                defaultValue:
                  "Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, …).",
              })}
            </p>
            <img
              src={enroll.qrDataUrl}
              alt="TOTP QR code"
              className="mx-auto h-48 w-48 rounded bg-white p-2"
            />
            <p className="text-muted-foreground text-xs">
              {t("mfa.enroll.manual", {
                defaultValue: "Can't scan? Enter this key manually:",
              })}
            </p>
            <code className="bg-muted break-all rounded p-2 text-center font-mono text-sm">
              {enroll.secret}
            </code>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("mfa.enroll.confirm", {
                defaultValue: "Enter the 6-digit code to confirm",
              })}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button>
              {t("mfa.enroll.confirmButton", {
                defaultValue: "Confirm & enable",
              })}
            </Button>
          </form>
        )}

        {/* One-time recovery codes, shown once. */}
        {step === "recovery" && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">
              {t("mfa.recovery.title", { defaultValue: "Recovery codes" })}
            </p>
            <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-3 text-xs text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-300">
              {t("mfa.recovery.body", {
                defaultValue:
                  "Save these one-time recovery codes somewhere safe. Each works once if you lose access to your authenticator. They will not be shown again.",
              })}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {recoveryCodes.map((rc) => (
                <code
                  key={rc}
                  className="bg-muted rounded p-1 text-center font-mono text-sm"
                >
                  {rc}
                </code>
              ))}
            </div>
            <Button
              onClick={() => {
                // mfaEnabled was already refreshed by confirm's onSuccess.
                setOpen(false);
                reset();
              }}
            >
              {t("mfa.recovery.done", { defaultValue: "I've saved my codes" })}
            </Button>
          </div>
        )}
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
  const trpc = useTRPC();

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

  const trpc = useTRPC();
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
          <MfaButton
            userID={userID ?? ""}
            mfaEnabled={user?.mfaEnabled}
            isLoading={isLoading}
          />
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
