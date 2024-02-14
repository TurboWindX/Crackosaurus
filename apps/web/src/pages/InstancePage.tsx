import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@repo/shadcn/components/ui/button";
import { useAuth } from "@repo/ui/auth";
import { useCluster } from "@repo/ui/clusters";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

import { GetInstanceResponse } from "../../../../packages/api/src/types.ts";

interface JobDataTableProps {
  values: GetInstanceResponse["response"]["jobs"];
}

const JobDataTable = ({ values }: JobDataTableProps) => {
  return (
    <DataTable
      type="Job"
      values={values ?? []}
      head={["Job", "Status", "Last Updated"]}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, status, updatedAt }) => [
        JID,
        <StatusBadge status={status as any} />,
        <RelativeTime time={updatedAt} />,
      ]}
      valueKey={({ JID }) => JID}
    />
  );
};

export const InstancePage = () => {
  const { instanceID } = useParams();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { oneInstance, loadOneInstance, removeInstance } = useCluster();

  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    loadOneInstance(instanceID ?? "");
  }, []);

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {oneInstance.name || oneInstance.IID}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {hasPermission("instances:remove") && (
            <div className="w-max">
              <DrawerDialog
                title="Remove Instance"
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

                    if (await removeInstance(instanceID ?? ""))
                      navigate("/instances");
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
      <JobDataTable values={oneInstance.jobs} />
    </div>
  );
};
