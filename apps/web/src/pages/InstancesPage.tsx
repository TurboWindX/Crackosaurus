import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Status } from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { tRPCInput, useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { InstanceTypeSelect } from "@repo/ui/clusters";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

export const InstancesPage = () => {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [newInstance, setNewInstance] = useState<
    tRPCInput["instance"]["create"]
  >({
    name: "",
    type: "",
  });

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const {
    data: instances,
    isLoading,
    error,
    isLoadingError,
  } = trpc.instance.getMany.useQuery(undefined, {
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

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.instance.getMany, undefined, "any"),
      getQueryKey(trpc.instance.getList, undefined, "any"),
    ],
    []
  );

  const { mutateAsync: createInstance } = trpc.instance.create.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const { mutateAsync: deleteInstances } = trpc.instance.deleteMany.useMutation(
    {
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      },
      onError: handleError,
    }
  );

  return (
    <div className="p-4">
      <DataTable
        singular={t("item.instance.singular")}
        plural={t("item.instance.plural")}
        values={instances ?? []}
        head={[
          t("item.instance.singular"),
          t("item.status"),
          t("item.time.update"),
        ]}
        valueKey={({ IID }) => IID}
        rowClick={({ IID }) => navigate(`/instances/${IID}`)}
        isLoading={isLoading}
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        row={({ IID, name, status, updatedAt }) => [
          name || IID,
          <StatusBadge status={status as Status} />,
          <RelativeTime time={updatedAt} />,
        ]}
        searchFilter={({ IID, name }, search) =>
          IID.toLocaleLowerCase().includes(search.toLowerCase()) ||
          !!name?.toLocaleLowerCase()?.includes(search.toLowerCase())
        }
        addDialog={
          <>
            <Input
              placeholder={t("item.name.singular")}
              type="text"
              value={newInstance.name!}
              onChange={(e) =>
                setNewInstance({
                  ...newInstance,
                  name: e.target.value,
                })
              }
            />
            <InstanceTypeSelect
              value={newInstance.type!}
              onValueChange={(type) => setNewInstance({ ...newInstance, type })}
            />
          </>
        }
        addValidate={() => newInstance.name !== "" && newInstance.type !== ""}
        noAdd={!hasPermission("instances:add")}
        onAdd={async () => {
          await createInstance(newInstance);
          return true;
        }}
        noRemove={!hasPermission("root")}
        onRemove={async (instances) => {
          await deleteInstances({
            instanceIDs: instances.map(({ IID }) => IID),
          });
          return true;
        }}
      />
    </div>
  );
};
