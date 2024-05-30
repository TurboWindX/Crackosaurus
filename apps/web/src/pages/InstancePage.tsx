import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { APIError, STATUS, Status } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type REQ, type RES } from "@repo/api/server/client/web";
import { HASH_TYPES, HashType } from "@repo/hashcat/data";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
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
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

interface JobDataTableProps {
  instanceID: string;
  values: RES<APIType["getInstance"]>["jobs"];
  isLoading?: boolean;
}

const JobDataTable = ({ instanceID, values, isLoading }: JobDataTableProps) => {
  const [newJob, setNewJob] = useState<REQ<APIType["createInstanceJob"]>>({
    instanceID,
    wordlist: "",
    hashType: "" as HashType,
    projectIDs: [],
  });

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { data: projectList, error } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: API.getProjectList,
  });

  useEffect(() => {
    if (error) handleError(error);
  }, [error]);

  const { mutateAsync: createInstanceJob } = useMutation({
    mutationFn: API.createInstanceJob,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", instanceID],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: deleteInstanceJobs } = useMutation({
    mutationFn: async (ids: string[]) =>
      Promise.all(
        ids.map((jobID) => API.deleteInstanceJob({ instanceID, jobID }))
      ),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", instanceID],
      });
    },
    onError: handleError,
  });

  return (
    <DataTable
      type="Job"
      values={values ?? []}
      head={["Job", "Status", "Last Updated"]}
      isLoading={isLoading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, status, updatedAt }) => [
        JID,
        <StatusBadge status={status as Status} />,
        <RelativeTime time={updatedAt} />,
      ]}
      addDialog={
        <>
          <Select
            value={newJob.hashType}
            onValueChange={(value) =>
              setNewJob({ ...newJob, hashType: value as HashType })
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
          <Input
            type="text"
            placeholder="Wordlist"
            value={newJob.wordlist}
            onChange={(e) => setNewJob({ ...newJob, wordlist: e.target.value })}
          />
          <MultiSelect
            label="Project"
            values={(projectList ?? []).map(({ PID, name }) => [PID, name])}
            selectedValues={newJob.projectIDs}
            onValueChange={(ids) => {
              setNewJob({ ...newJob, projectIDs: ids });
            }}
          />
        </>
      }
      addValidate={() =>
        newJob.hashType?.length > 0 && newJob.wordlist.length > 0
      }
      onAdd={async () => {
        await createInstanceJob({ ...newJob, instanceID });
        return true;
      }}
      onRemove={async (jobs) => {
        await deleteInstanceJobs(jobs.map(({ JID }) => JID));
        return true;
      }}
      searchFilter={({ JID }, search) => JID.includes(search)}
      valueKey={({ JID }) => JID}
    />
  );
};

export const InstancePage = () => {
  const { instanceID } = useParams();

  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [removeOpen, setRemoveOpen] = useState(false);

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const {
    data: instance,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["instances", instanceID],
    queryFn: async () => API.getInstance({ instanceID: instanceID ?? "" }),
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: deleteInstance } = useMutation({
    mutationFn: API.deleteInstance,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", "list"],
      });

      navigate("/instances");
    },
    onError: handleError,
  });

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            {instance?.name || instance?.IID || "Instance"}
          </span>
          <div>
            <StatusBadge status={(instance?.status ?? STATUS.Unknown) as any} />
          </div>
        </div>
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

                    await deleteInstance({ instanceID: instanceID ?? "" });
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
        isLoading={isLoading}
      />
    </div>
  );
};
