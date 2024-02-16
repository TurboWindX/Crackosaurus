import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type APIType } from "@repo/api/server";
import { type REQ } from "@repo/api/server/client/web";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

export const InstancesPage = () => {
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

  const { data: instances, isLoading } = useQuery({
    queryKey: ["instances", "list", "page"],
    queryFn: API.getInstances,
  });

  const { mutateAsync: createInstance } = useMutation({
    mutationFn: API.createInstance,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", "list"],
      });
    },
  });

  return (
    <div className="p-4">
      <DataTable
        type="Instance"
        values={instances ?? []}
        head={["Instance", "Status", "Last Updated"]}
        valueKey={({ IID }) => IID}
        rowClick={({ IID }) => navigate(`/instances/${IID}`)}
        isLoading={isLoading}
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        row={({ IID, name, status, updatedAt }) => [
          name || IID,
          <StatusBadge status={status as any} />,
          <RelativeTime time={updatedAt} />,
        ]}
        searchFilter={({ IID, name }, search) =>
          IID.toLocaleLowerCase().includes(search.toLowerCase()) ||
          !!name?.toLocaleLowerCase()?.includes(search.toLowerCase())
        }
        addDialog={
          <>
            <Input
              placeholder="Name"
              type="text"
              value={newInstance.name ?? ""}
              onChange={(e) =>
                setNewInstance({
                  ...newInstance,
                  name: e.target.value,
                })
              }
            />
            <Input
              placeholder="Type"
              type="text"
              value={newInstance.type ?? ""}
              onChange={(e) =>
                setNewInstance({
                  ...newInstance,
                  type: e.target.value,
                })
              }
            />
          </>
        }
        noAdd={!hasPermission("instances:add")}
        onAdd={async () => {
          await createInstance(newInstance);
          return true;
        }}
      />
    </div>
  );
};
