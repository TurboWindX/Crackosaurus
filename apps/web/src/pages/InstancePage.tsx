import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { STATUS, Status } from "@repo/api";
import { HASH_TYPES } from "@repo/hashcat/data";
import { Button } from "@repo/shadcn/components/ui/button";
import { MultiSelect } from "@repo/shadcn/components/ui/multi-select";
import { tRPCInput, tRPCOutput, useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { HashTypeSelect } from "@repo/ui/hashes";
import { RuleSelect } from "@repo/ui/rules";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { WordlistSelect } from "@repo/ui/wordlists";

interface JobDataTableProps {
  instanceID: string;
  values: tRPCOutput["instance"]["get"]["jobs"];
  isLoading?: boolean;
}

const JobDataTable = ({ instanceID, values, isLoading }: JobDataTableProps) => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [newJob, setNewJob] = useState<
    tRPCInput["instance"]["createJobs"]["data"][number]
  >({
    wordlistID: "",
    hashType: HASH_TYPES.plaintext,
    projectIDs: [],
    ruleID: undefined,
  });

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { data: projectList, error } = trpc.project.getList.useQuery();

  useEffect(() => {
    if (error) handleError(error);
  }, [error]);

  const queryKeys = useMemo(
    () => [
      getQueryKey(
        trpc.instance.get,
        {
          instanceID,
        },
        "any"
      ),
      getQueryKey(trpc.instance.getMany, undefined, "any"),
      getQueryKey(trpc.instance.getList, undefined, "any"),
    ],
    []
  );

  const { mutateAsync: createInstanceJobs } =
    trpc.instance.createJobs.useMutation({
      onSuccess(_, { data }) {
        const projectIDs: string[] = [
          ...new Set<string>(data.flatMap(({ projectIDs }) => projectIDs)),
        ];

        const projectQueryKeys = projectIDs.map((projectID) =>
          getQueryKey(trpc.project.get, { projectID }, "any")
        );

        [...queryKeys, ...projectQueryKeys].forEach((key) =>
          queryClient.invalidateQueries(key)
        );
      },
      onError: handleError,
    });
  const { mutateAsync: deleteInstanceJobs } =
    trpc.instance.deleteJobs.useMutation({
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      },
      onError: handleError,
    });

  return (
    <DataTable
      singular={t("item.job.singular")}
      plural={t("item.job.plural")}
      values={(values ?? []).map((v) => ({
        ...v,
        status: v.status as Status,
        updatedAt: new Date(v.updatedAt),
      }))}
      head={[t("item.job.singular"), t("item.status"), t("item.time.update")]}
      isLoading={isLoading}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sort={(a: any, b: any) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={(value) => {
        const { JID, status, updatedAt } = value as {
          JID: string;
          status: Status;
          updatedAt: Date;
        };
        return [
          JID,
          <StatusBadge status={status as Status} />,
          <RelativeTime time={updatedAt} />,
        ];
      }}
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
          <div className="mt-2">
            <label className="mb-1 block text-sm font-medium">
              Optional Rule
            </label>
            <RuleSelect
              value={newJob.ruleID ?? null}
              onValueChange={(v) =>
                setNewJob({ ...newJob, ruleID: v || undefined })
              }
            />
          </div>
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
        newJob.hashType >= 0 &&
        newJob.wordlistID.length > 0 &&
        newJob.projectIDs.length > 0
      }
      onAdd={async () => {
        await createInstanceJobs({
          instanceID,
          data: [newJob],
        });
        return true;
      }}
      onRemove={async (jobs) => {
        await deleteInstanceJobs({
          instanceID,
          jobIDs: jobs.map(({ JID }) => JID),
        });
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
  const trpc = useTRPC();

  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [removeOpen, setRemoveOpen] = useState(false);

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const {
    data: instance,
    isLoading,
    error,
    isLoadingError,
  } = trpc.instance.get.useQuery(
    { instanceID: instanceID! },
    {
      retry(count, error) {
        if (
          error instanceof TRPCClientError &&
          error.data?.code === "UNAUTHORIZED"
        )
          return false;
        return count < 3;
      },
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    }
  );

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

  const { mutateAsync: deleteInstances } = trpc.instance.deleteMany.useMutation(
    {
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));

        navigate("/instances");
      },
      onError: handleError,
    }
  );

  return (
    <div className="grid gap-4 p-4">
      <div className="flex gap-2">
        <div className="flex flex-col gap-2">
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            {instance?.name || instance?.IID || "Instance"}
          </span>
          <div>
            <StatusBadge
              status={(instance?.status ?? STATUS.Unknown) as Status}
            />
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

                    await deleteInstances({
                      instanceIDs: [instanceID!],
                    });
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
