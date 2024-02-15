import { PlayIcon, SquareIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { GetInstanceResponse, HASH_TYPES, HashType } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { MultiSelect } from "@repo/shadcn/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";
import { useAuth } from "@repo/ui/auth";
import { useCluster } from "@repo/ui/clusters";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useLoading } from "@repo/ui/requests";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

interface JobDataTableProps {
  instanceID: string;
  values: GetInstanceResponse["response"]["jobs"];
  loading?: boolean;
}

const JobDataTable = ({ instanceID, values, loading }: JobDataTableProps) => {
  const { addJobs, removeJobs } = useCluster();

  const [addJob, setAddJob] = useState<{
    hashType: HashType;
    projectIDs: string[];
  }>({
    hashType: "" as any,
    projectIDs: [],
  });

  return (
    <DataTable
      type="Job"
      values={values ?? []}
      head={["Job", "Status", "Last Updated"]}
      loading={loading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, status, updatedAt }) => [
        JID,
        <StatusBadge status={status as any} />,
        <RelativeTime time={updatedAt} />,
      ]}
      addDialog={
        <>
          <Select
            value={addJob.hashType}
            onValueChange={(value) =>
              setAddJob({ ...addJob, hashType: value as any })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Hash Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Hash Type</SelectLabel>
                {HASH_TYPES.map((type) => (
                  <SelectItem value={type}>{type}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <MultiSelect
            label="Project"
            values={[["123", "Name"]]}
            selectedValues={addJob.projectIDs}
            onValueChange={(ids) => {
              setAddJob({ ...addJob, projectIDs: ids });
            }}
          />
        </>
      }
      addValidate={() => addJob.hashType?.length > 0}
      onAdd={async () => false}
      onRemove={async (jobs) =>
        await removeJobs(instanceID, ...jobs.map(({ JID }) => JID))
      }
      searchFilter={({ JID }, search) => JID.includes(search)}
      valueKey={({ JID }) => JID}
    />
  );
};

export const InstancePage = () => {
  const { instanceID } = useParams();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { instance, loadInstance, removeInstances } = useCluster();

  const [startOpen, setStartOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const { getLoading } = useLoading();
  const loading = getLoading("instance-one");

  useEffect(() => {
    loadInstance(instanceID ?? "");
  }, [instanceID]);

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {instance?.name || instance?.IID || "Instance"}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {hasPermission("instances:start") && (
            <div className="w-max">
              <DrawerDialog
                title="Start Instance"
                open={startOpen}
                setOpen={setStartOpen}
                trigger={
                  <Button variant="outline">
                    <div className="grid grid-flow-col items-center gap-2">
                      <PlayIcon />
                      <span>Start</span>
                    </div>
                  </Button>
                }
              >
                <form
                  className="grid gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault();

                    if (await removeInstances(instanceID ?? ""))
                      navigate("/instances");
                  }}
                >
                  <span>Do you want to start this instance?</span>
                  <Button>Start</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
          {hasPermission("instances:stop") && (
            <div className="w-max">
              <DrawerDialog
                title="Stop Instance"
                open={stopOpen}
                setOpen={setStopOpen}
                trigger={
                  <Button variant="outline">
                    <div className="grid grid-flow-col items-center gap-2">
                      <SquareIcon />
                      <span>Stop</span>
                    </div>
                  </Button>
                }
              >
                <form
                  className="grid gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault();

                    if (await removeInstances(instanceID ?? ""))
                      navigate("/instances");
                  }}
                >
                  <span>Do you want to stop this instance?</span>
                  <Button>Stop</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
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

                    if (await removeInstances(instanceID ?? ""))
                      navigate("/instances");
                  }}
                >
                  <span>Do you want to permanently remove this instance?</span>
                  <Button>Remove</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
        </div>
      </div>
      <JobDataTable
        instanceID={instance?.IID ?? ""}
        values={instance?.jobs ?? []}
        loading={loading}
      />
    </div>
  );
};
