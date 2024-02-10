import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CreateInstanceRequest } from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { ProviderSelect, useInstances } from "@repo/ui/instances";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

export const InstancesPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { list, loadList, add, remove } = useInstances();

  const [addInstance, setAddInstance] = useState<CreateInstanceRequest["Body"]>(
    {
      name: "",
      provider: "" as any,
      type: "",
    }
  );

  useEffect(() => {
    loadList();
  }, []);

  return (
    <div className="p-4">
      <DataTable
        type="Instance"
        values={list}
        head={["Instance", "Provider", "Status", "Last Updated"]}
        valueKey={({ IID }) => IID}
        rowClick={({ IID }) => navigate(`/instances/${IID}`)}
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        row={({ IID, name, provider, status, updatedAt }) => [
          name || IID,
          provider,
          <StatusBadge status={status as any} />,
          <RelativeTime time={updatedAt} />,
        ]}
        searchFilter={({ IID, name }, search) =>
          IID.toLocaleLowerCase().includes(search.toLowerCase()) ||
          !!name?.toLocaleLowerCase()?.includes(search.toLowerCase())
        }
        addValidate={() => addInstance.provider.trim().length > 0}
        addDialog={
          <>
            <Input
              placeholder="Name"
              type="text"
              value={addInstance.name}
              onChange={(e) =>
                setAddInstance({
                  ...addInstance,
                  name: e.target.value,
                })
              }
            />
            <ProviderSelect
              value={addInstance.provider}
              onValueChange={(provider) => {
                setAddInstance({
                  ...addInstance,
                  provider,
                });
              }}
            />
            <Input
              placeholder="Type"
              type="text"
              value={addInstance.type}
              onChange={(e) =>
                setAddInstance({
                  ...addInstance,
                  type: e.target.value,
                })
              }
            />
          </>
        }
        noAdd={!hasPermission("instances:add")}
        onAdd={() => add(addInstance)}
        noRemove
        onRemove={(instances) => remove(...instances.map(({ IID }) => IID))}
      />
    </div>
  );
};
