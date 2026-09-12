import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { useTRPC } from "@repo/ui/api";
import { useErrors } from "@repo/ui/errors";

// Client-side mirror of MAX_INSTANCE_LIFE_HOURS_CEILING (apps/server .../lib/
// settings.ts). Kept in sync manually; the server re-validates on save.
const MAX_INSTANCE_LIFE_HOURS_CEILING = 8760;

const MaxInstanceLifeSetting = () => {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  // Local input state as a string so the field can be cleared while editing;
  // parsed to an int on submit. Seeded from the server value once it loads.
  const [hours, setHours] = useState("");

  const {
    data: settings,
    isLoading,
    error,
    isLoadingError,
  } = trpc.settings.get.useQuery(undefined, {
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

  useEffect(() => {
    if (settings) setHours(String(settings.maxInstanceLifeHours));
  }, [settings]);

  const queryKey = useMemo(
    () => getQueryKey(trpc.settings.get, undefined, "any"),
    []
  );

  const { mutateAsync: setMaxInstanceLife, isLoading: isSaving } =
    trpc.settings.setMaxInstanceLife.useMutation({
      onSuccess() {
        queryClient.invalidateQueries(queryKey);
      },
      onError: handleError,
    });

  const parsed = Number.parseInt(hours, 10);
  const valid =
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_INSTANCE_LIFE_HOURS_CEILING;

  return (
    <div className="grid gap-2">
      <span className="text-lg font-medium">
        {t("page.settings.maxLife.title", {
          defaultValue: "Max instance life",
        })}
      </span>
      <p className="text-muted-foreground text-sm">
        {t("page.settings.maxLife.description", {
          defaultValue:
            "Automatically terminate an instance once it has run this many hours. Only idle instances are terminated — a box that is still running a job is left alone until the job finishes. Set to 0 to disable.",
        })}
      </p>
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await setMaxInstanceLife({ hours: parsed });
        }}
      >
        <Input
          type="number"
          min={0}
          max={MAX_INSTANCE_LIFE_HOURS_CEILING}
          className="w-32"
          placeholder="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={isLoading}
        />
        <span className="text-muted-foreground pb-2 text-sm">
          {t("page.settings.maxLife.unit", { defaultValue: "hours" })}
        </span>
        <Button disabled={!valid || isLoading || isSaving}>
          {t("action.update.text")}
        </Button>
      </form>
    </div>
  );
};

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 p-4">
      <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
        {t("page.settings.title", { defaultValue: "Settings" })}
      </span>
      <Separator />
      <MaxInstanceLifeSetting />
    </div>
  );
};
