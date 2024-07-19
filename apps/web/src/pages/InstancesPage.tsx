import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { APIError, Status } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type REQ } from "@repo/api/server/client/web";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { InstanceTypeSelect } from "@repo/ui/clusters";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

export const InstancesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [newInstance, setNewInstance] = useState<
    REQ<APIType["createInstance"]>
  >({
    name: "",
    type: "",
  });

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const {
    data: instances,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["instances", "list", "page"],
    queryFn: API.getInstances,
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: createInstance } = useMutation({
    mutationFn: API.createInstance,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", "list"],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: deleteInstances } = useMutation({
    mutationFn: (instanceIDs: string[]) => API.deleteInstances({ instanceIDs }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", "list"],
      });
    },
    onError: handleError,
  });

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
        noAdd={!hasPermission("instances:add")}
        onAdd={async () => {
          await createInstance(newInstance);
          return true;
        }}
        noRemove={!hasPermission("root")}
        onRemove={async (instances) => {
          await deleteInstances(instances.map(({ IID }) => IID));
          return true;
        }}
      />
    </div>
  );
};
