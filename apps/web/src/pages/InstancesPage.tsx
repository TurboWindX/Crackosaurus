import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CreateInstanceRequest } from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAuth } from "@repo/ui/auth";
import { useCluster } from "@repo/ui/clusters";
import { DataTable } from "@repo/ui/data";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

export const InstancesPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { listInstances, loadListInstances, addInstance, removeInstance } =
    useCluster();

  const [newInstance, setNewInstance] = useState<CreateInstanceRequest["Body"]>(
    {
      name: "",
      type: "",
    }
  );

  useEffect(() => {
    loadListInstances();
  }, []);

  return (
    <div className="p-4">
      <DataTable
        type="Instance"
        values={listInstances}
        head={["Instance", "Status", "Last Updated"]}
        valueKey={({ IID }) => IID}
        rowClick={({ IID }) => navigate(`/instances/${IID}`)}
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
              value={newInstance.name}
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
              value={newInstance.type}
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
        onAdd={() => addInstance(newInstance)}
        noRemove
        onRemove={(instances) =>
          removeInstance(...instances.map(({ IID }) => IID))
        }
      />
    </div>
  );
};
