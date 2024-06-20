import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { APIError, STATUS, Status } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type REQ, type RES } from "@repo/api/server/client/web";
import { HASH_TYPES } from "@repo/hashcat/data";
import { Button } from "@repo/shadcn/components/ui/button";
import { MultiSelect } from "@repo/shadcn/components/ui/multi-select";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { HashTypeSelect } from "@repo/ui/hashes";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { WordlistSelect } from "@repo/ui/wordlists";

interface JobDataTableProps {
  instanceID: string;
  values: RES<APIType["getInstance"]>["jobs"];
  isLoading?: boolean;
}

const JobDataTable = ({ instanceID, values, isLoading }: JobDataTableProps) => {
  const { t } = useTranslation();

  const [newJob, setNewJob] = useState<REQ<APIType["createInstanceJob"]>>({
    instanceID,
    wordlistID: "",
    hashType: HASH_TYPES.plaintext,
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
    mutationFn: async (jobIDs: string[]) =>
      API.deleteInstanceJobs({ instanceID, jobIDs }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", instanceID],
      });
    },
    onError: handleError,
  });

  return (
    <DataTable
      singular={t("item.job.singular")}
      plural={t("item.job.plural")}
      values={values ?? []}
      head={[t("item.job.singular"), t("item.status"), t("item.time.update")]}
      isLoading={isLoading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, status, updatedAt }) => [
        JID,
        <StatusBadge status={status as Status} />,
        <RelativeTime time={updatedAt} />,
      ]}
      addDialog={
        <>
          <HashTypeSelect
            value={newJob.hashType}
            onValueChange={(hashType) => setNewJob({ ...newJob, hashType })}
          />
          <WordlistSelect
            value={newJob.wordlistID}
            onValueChange={(wordlistID) => setNewJob({ ...newJob, wordlistID })}
          />
          <MultiSelect
            label={t("item.project.singular")}
            values={(projectList ?? []).map(({ PID, name }) => [PID, name])}
            selectedValues={newJob.projectIDs}
            onValueChange={(projectIDs) => {
              setNewJob({ ...newJob, projectIDs });
            }}
          />
        </>
      }
      addValidate={() =>
        newJob.hashType > 0 &&
        newJob.wordlistID.length > 0 &&
        newJob.projectIDs.length > 0
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
  const { t } = useTranslation();

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
    queryFn: async () => API.getInstance({ instanceID: instanceID! }),
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
    mutationFn: (instanceID: string) =>
      API.deleteInstances({ instanceIDs: [instanceID] }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["instances", "list"],
      });

      navigate("/instances");
    },
    onError: handleError,
  });

  return (
    <div className="grid gap-4 p-4">
      <div className="flex gap-2">
        <div className="flex flex-col gap-2">
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            {instance?.name || instance?.IID || "Instance"}
          </span>
          <div>
            <StatusBadge status={(instance?.status ?? STATUS.Unknown) as any} />
          </div>
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          {hasPermission("instances:remove") && (
            <div className="w-max">
              <DrawerDialog
                title={t("action.remove.item", {
                  item: t("instance.singular").toLowerCase(),
                })}
                open={removeOpen}
                setOpen={setRemoveOpen}
                trigger={
                  <Button variant="outline">
                    <div className="grid grid-flow-col items-center gap-2">
                      <TrashIcon />
                      <span>{t("action.remove.text")}</span>
                    </div>
                  </Button>
                }
              >
                <form
                  className="grid gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();

                    await deleteInstance(instanceID!);
                  }}
                >
                  <span>
                    {t("action.remove.warn", {
                      item: t("instance.singular").toLowerCase(),
                    })}
                  </span>
                  <Button>{t("action.remove.text")}</Button>
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
