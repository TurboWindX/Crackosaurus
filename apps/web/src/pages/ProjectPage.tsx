import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { CheckIcon, PlayIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Status } from "@repo/api";
import { INSTANCE_TYPES } from "@repo/app-config/instance-types";
import { HASH_TYPES, getHashName } from "@repo/hashcat/data";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { tRPCInput, tRPCOutput, useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { HashTypeSelect } from "@repo/ui/hashes";
import { RuleSelect } from "@repo/ui/rules";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { UserSelect } from "@repo/ui/users";
import { WordlistSelect } from "@repo/ui/wordlists";

type ProjectJobWithType = NonNullable<
  NonNullable<tRPCOutput["project"]["get"]["hashes"]>[number]["jobs"]
>[number] & { type: number };

const HASH_IMPORT_VALIDATOR = z
  .object({
    hash: z.string(),
    type: z.number().int().min(0),
  })
  .array();

interface HashDataTableProps {
  projectID: string;
  values: tRPCOutput["project"]["get"]["hashes"];
  isLoading?: boolean;
}

const HashDataTable = ({
  projectID,
  values,
  isLoading,
}: HashDataTableProps) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const trpc = useTRPC();

  const [newHash, setNewHash] = useState<
    tRPCInput["hash"]["createMany"]["data"][number]
  >({
    hash: "",
    hashType: HASH_TYPES.plaintext,
  });

  const [importHashType, setImportHashType] = useState<number>(
    HASH_TYPES.plaintext
  );

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const [viewOpen, setViewOpen] = useState(false);
  const [viewHashID, setViewHashID] = useState<string | null>(null);
  const viewHash = useMemo(
    () =>
      values?.find((hash: { HID: string | null }) => hash.HID === viewHashID)
        ?.value,
    [viewHashID]
  );

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.project.get, { projectID }, "any"),
      getQueryKey(trpc.project.getMany, undefined, "any"),
      getQueryKey(trpc.project.getList, undefined, "any"),
    ],
    []
  );

  const { mutateAsync: addHashes } = trpc.hash.createMany.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const { mutateAsync: removeHashes } = trpc.hash.deleteMany.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const parseImportData = (contents: string) => {
    try {
      const data = JSON.parse(contents);
      if (Array.isArray(data)) return data;
    } catch {
      // not JSON, try as text
    }
    // Parse as newline-separated hashes, use selected type
    return contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((hash) => ({ hash, type: importHashType }));
  };

  return (
    <>
      <DrawerDialog
        title={t("item.hash.singular")}
        open={viewOpen}
        setOpen={setViewOpen}
      >
        {viewHash ?? t("error.NOT_FOUND")}
      </DrawerDialog>
      <DataTable
        singular={t("item.hash.singular")}
        plural={t("item.hash.plural")}
        values={(values ?? []).map((v) => ({
          ...v,
          status: v.status as Status,
          updatedAt: new Date(v.updatedAt),
          value: v.value ?? undefined,
        }))}
        head={[
          t("item.hash.singular"),
          t("item.type.singular"),
          t("item.status"),
          t("item.time.update"),
        ]}
        valueKey={(value) => (value as { HID: string }).HID}
        isLoading={isLoading}
        row={(value: {
          HID: string;
          hash: string;
          hashType: number;
          status: Status;
          updatedAt: Date;
          value?: string;
        }) => {
          const { hash, hashType, status, updatedAt } = value;
          return [
            <div className="max-w-32 truncate md:max-w-64 lg:max-w-[50vw]">
              {hash}
            </div>,
            getHashName(hashType),
            <StatusBadge status={status as Status} />,
            <RelativeTime time={updatedAt} />,
          ];
        }}
        rowClick={
          hasPermission("hashes:view")
            ? ({ HID }) => {
                setViewHashID(HID);
                setViewOpen(true);
              }
            : undefined
        }
        noAdd={!hasPermission("hashes:add")}
        onAdd={async () => {
          await addHashes({
            projectID,
            data: [newHash],
          });

          setNewHash({ ...newHash, hash: "" });

          return true;
        }}
        noRemove={!hasPermission("hashes:remove")}
        onRemove={async (hashes) => {
          await removeHashes({
            projectID,
            hashIDs: hashes.map(({ HID }) => HID),
          });
          return true;
        }}
        noImport={!hasPermission("hashes:add")}
        parseImportData={parseImportData}
        importAccept={["application/json", ".json", "text/plain", ".txt"]}
        importChildren={
          <HashTypeSelect
            value={importHashType}
            onValueChange={(type: number) => setImportHashType(type)}
          />
        }
        onImport={async (data) => {
          const result = HASH_IMPORT_VALIDATOR.safeParse(data);
          if (result.error) {
            console.log(result.error.format());
            return false;
          }

          await addHashes({
            projectID,
            data: result.data.map(({ hash, type }) => ({
              hash: hash,
              hashType: type,
            })),
          });

          return true;
        }}
        exportPrefix={`hashes-${projectID}`}
        noExport={!hasPermission("hashes:get")}
        onExport={async (data) => {
          return data.map(({ hash, hashType, value }) => ({
            hash,
            type: hashType,
            value,
          }));
        }}
        searchFilter={({ hash, hashType }, search) =>
          hash.toLowerCase().includes(search.toLowerCase()) ||
          hashType.toString().includes(search.toLowerCase())
        }
        addValidate={() =>
          (newHash.hash ?? "").trim().length > 0 && newHash.hashType > 0
        }
        addDialog={
          <>
            <Input
              placeholder={t("item.value.singular")}
              value={newHash.hash}
              onChange={(e) =>
                setNewHash({
                  ...newHash,
                  hash: e.target.value,
                })
              }
            />
            <HashTypeSelect
              value={newHash.hashType}
              onValueChange={(hashType) => setNewHash({ ...newHash, hashType })}
            />
          </>
        }
      />
    </>
  );
};

interface PendingJobsSectionProps {
  projectID: string;
  jobs: (ProjectJobWithType & {
    approvalStatus?: string | null;
    submittedBy?: { ID: string; username: string } | null;
    wordlist?: { WID: string; name: string | null } | null;
    instanceType?: string | null;
    instance?: { IID: string; name: string | null } | null;
  })[];
}

const PendingJobsSection = ({ projectID, jobs }: PendingJobsSectionProps) => {
  const { t } = useTranslation();
  const { hasPermission, uid } = useAuth();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();
  const { toast } = useToast();

  const pendingJobs = useMemo(
    () => jobs.filter((job) => job.approvalStatus === "PENDING"),
    [jobs]
  );

  const myPendingJobs = useMemo(
    () => pendingJobs.filter((job) => job.submittedBy?.ID === uid),
    [pendingJobs, uid]
  );

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.project.get, { projectID }, "any"),
      getQueryKey(trpc.project.getMany, undefined, "any"),
    ],
    [projectID]
  );

  const { mutateAsync: approveOne } = trpc.job.approve.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      toast({
        title: t("message.job.approved", { defaultValue: "Job Approved" }),
        description: t("message.job.approved.description", {
          defaultValue: "The job has been approved and sent to the cluster.",
        }),
      });
    },
    onError: handleError,
  });

  const { mutateAsync: approveMany } = trpc.job.approveMany.useMutation({
    onSuccess(count) {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      toast({
        title: t("message.jobs.approved", { defaultValue: "Jobs Approved" }),
        description: t("message.jobs.approved.description", {
          defaultValue: `${count} job(s) have been approved and sent to the cluster.`,
          count,
        }),
      });
    },
    onError: handleError,
  });

  const handleApproveAll = async () => {
    if (pendingJobs.length === 0) return;
    await approveMany({ jobIDs: pendingJobs.map((j) => j.JID) });
  };

  // If user is admin, show all pending jobs with approve buttons
  if (hasPermission("jobs:approve") && pendingJobs.length > 0) {
    return (
      <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950/20">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            ⏳{" "}
            {t("message.pending.jobs.title", {
              defaultValue: "Pending Approval",
            })}{" "}
            ({pendingJobs.length})
          </h3>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleApproveAll}>
              {t("action.approve.all", { defaultValue: "Approve All Jobs" })}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {pendingJobs.map((job) => (
            <div
              key={job.JID}
              className="flex items-center justify-between rounded border bg-white p-3 dark:bg-gray-900"
            >
              <div className="flex-1">
                <div className="font-medium">
                  {t("field.job.id", { defaultValue: "Job" })}:{" "}
                  {job.JID.slice(0, 8)}...
                </div>
                <div className="text-muted-foreground text-sm">
                  {t("field.submitted.by", { defaultValue: "Submitted by" })}:{" "}
                  <span className="font-medium">
                    {job.submittedBy?.username || "Unknown"}
                  </span>{" "}
                  • {t("field.wordlist", { defaultValue: "Wordlist" })}:{" "}
                  {job.wordlist?.name || "Unknown"} •{" "}
                  {t("field.instance.type", { defaultValue: "Instance Type" })}:{" "}
                  <span className="font-mono font-semibold">
                    {job.instanceType ||
                      (job.instance
                        ? job.instance.name || job.instance.IID
                        : "Unknown")}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => approveOne({ jobID: job.JID })}
                className="ml-4"
              >
                <CheckIcon className="mr-1 h-4 w-4" />
                {t("action.approve", { defaultValue: "Approve" })}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // If user is contributor, show only their pending jobs (info only, no approve buttons)
  if (myPendingJobs.length > 0) {
    return (
      <div className="rounded-lg border border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/20">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          ⏳{" "}
          {t("message.your.pending.jobs", {
            defaultValue: "Your Pending Jobs",
          })}{" "}
          ({myPendingJobs.length})
        </h3>
        <div className="space-y-2">
          {myPendingJobs.map((job) => (
            <div
              key={job.JID}
              className="rounded border bg-white p-3 dark:bg-gray-900"
            >
              <div className="font-medium">
                {t("field.job.id", { defaultValue: "Job" })}:{" "}
                {job.JID.slice(0, 8)}...
              </div>
              <div className="text-muted-foreground text-sm">
                {t("message.waiting.approval", {
                  defaultValue:
                    "Waiting for admin approval. You'll be notified when it's approved.",
                })}{" "}
                • {t("field.wordlist", { defaultValue: "Wordlist" })}:{" "}
                {job.wordlist?.name || "Unknown"} •{" "}
                {t("field.instance.type", { defaultValue: "Instance Type" })}:{" "}
                <span className="font-mono font-semibold">
                  {job.instanceType ||
                    (job.instance
                      ? job.instance.name || job.instance.IID
                      : "Unknown")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

interface JobDataTableProps {
  values: ProjectJobWithType[];
  isLoading?: boolean;
}

const JobDataTable = ({ values, isLoading }: JobDataTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DataTable
      singular={t("item.job.singular")}
      plural={t("item.job.plural")}
      values={values ?? []}
      head={[
        t("item.job.singular"),
        t("item.type.singular"),
        t("item.instance.singular"),
        t("item.status"),
        t("item.time.update"),
      ]}
      valueKey={({ JID }) => JID}
      rowClick={({ instance }) =>
        instance && navigate(`/instances/${instance.IID}`)
      }
      isLoading={isLoading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, type, status, updatedAt, instance, instanceType }) => [
        JID,
        getHashName(type),
        instance ? instance.name || instance.IID : instanceType || "Pending",
        <StatusBadge status={status as Status} />,
        <RelativeTime time={updatedAt} />,
      ]}
      noAdd
      noRemove
    />
  );
};

interface UserDataTableProps {
  projectID: string;
  values: tRPCOutput["project"]["get"]["members"];
  isLoading?: boolean;
}

const UserDataTable = ({
  projectID,
  values,
  isLoading,
}: UserDataTableProps) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const trpc = useTRPC();

  const [newUserID, setNewUserID] = useState<string>("");

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.project.get, { projectID }, "any"),
      getQueryKey(trpc.project.getMany, undefined, "any"),
      getQueryKey(trpc.project.getList, undefined, "any"),
    ],
    []
  );

  const { mutateAsync: addUsers } = trpc.project.addUsers.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const { mutateAsync: removeUsers } = trpc.project.removeUsers.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  return (
    <DataTable
      singular={t("item.user.singular")}
      plural={t("item.user.plural")}
      values={values ?? []}
      head={[t("item.user.singular")]}
      valueKey={(value) => (value as { ID: string }).ID}
      row={(value: { ID: string; username?: string }) => [value.username]}
      isLoading={isLoading}
      searchFilter={(
        value: { ID: string; username?: string },
        search: string
      ) => (value.username ?? "").toLowerCase().includes(search)}
      sort={(
        a: { ID: string; username?: string },
        b: { ID: string; username?: string }
      ) => (a.username ?? "").localeCompare(b.username ?? "")}
      addValidate={() => newUserID.length > 0}
      addDialog={
        <>
          <UserSelect
            value={newUserID}
            onValueChange={(userID) => setNewUserID(userID)}
            filter={({ ID }) =>
              (values ?? []).every(
                (member: { ID: string }) => ID !== member.ID
              ) === true
            }
          />
        </>
      }
      noAdd={!hasPermission("projects:users:add")}
      onAdd={async () => {
        await addUsers({
          projectID,
          userIDs: [newUserID],
        });

        setNewUserID("");

        return true;
      }}
      noRemove={!hasPermission("projects:users:remove")}
      onRemove={async (users) => {
        await removeUsers({
          projectID,
          userIDs: users.map((user) => (user as { ID: string }).ID),
        });
        return true;
      }}
    />
  );
};

interface LaunchButtonProps {
  projectID: string;
  hashes: tRPCOutput["project"]["get"]["hashes"];
  isLoading: boolean;
  // callback to inform parent that N job requests were submitted
  onRequestsSubmitted?: (count: number) => void;
}

const LaunchButton = ({
  projectID,
  isLoading,
  hashes,
  onRequestsSubmitted,
}: LaunchButtonProps) => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [open, setOpen] = useState(false);

  const [instanceType, setInstanceType] = useState("");
  const [wordlistID, setWordlistID] = useState("");
  const [ruleID, setRuleID] = useState("");

  const todoHashes = useMemo(
    () =>
      (hashes ?? []).filter(
        (hash: { value?: string | null }) => typeof hash.value !== "string"
      ),
    [hashes]
  );
  const hasTodoHashes = useMemo(() => todoHashes.length > 0, [todoHashes]);

  const isValid = useMemo(
    () => instanceType.length > 0 && wordlistID.length > 0 && hasTodoHashes,
    [instanceType, wordlistID, hasTodoHashes]
  );

  const { hasPermission } = useAuth();

  const queryClient = useQueryClient();
  const { handleError } = useErrors();
  const { toast } = useToast();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.project.get, { projectID }, "any"),
      getQueryKey(trpc.project.getMany, undefined, "any"),
      getQueryKey(trpc.project.getList, undefined, "any"),
    ],
    []
  );

  const { mutateAsync: requestJobs } = trpc.job.requestJobs.useMutation({
    onSuccess(data) {
      // Invalidate server caches so data will refresh
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      // Inform parent (if provided) how many job requests were created
      try {
        if (onRequestsSubmitted) onRequestsSubmitted(data.length);
      } catch {
        /* ignore */
      }
    },
    onError: handleError,
  });

  // Use shared instance-types to keep UI and server in sync
  const instanceTypes = INSTANCE_TYPES as { value: string; label: string }[];

  // Set default instance type to g6.48xlarge
  if (!instanceType && open) {
    setInstanceType("g6.48xlarge");
  }

  if (!hasPermission("instances:jobs:add")) return <></>;

  return (
    <DrawerDialog
      title={t("action.launch.item", { item: t("item.project.singular") })}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline" disabled={isLoading || !hasTodoHashes}>
          <div className="grid grid-flow-col items-center gap-2">
            <PlayIcon />
            <span>{t("action.launch.text")}</span>
          </div>
        </Button>
      }
    >
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();

          const hashTypes = Array.from(
            new Set(
              todoHashes.map((h: { hashType?: number | string }) =>
                Number(h.hashType)
              )
            )
          ) as number[];

          await requestJobs({
            instanceType,
            data: hashTypes.map((hashType) => ({
              wordlistID,
              ruleID: ruleID || undefined,
              hashType,
              projectIDs: [projectID],
            })),
          });

          toast({
            title: t("message.job.submitted.title", {
              defaultValue: "Job Submitted for Approval",
            }),
            description: t("message.job.submitted.description", {
              defaultValue:
                "Your job request has been submitted. An admin will review and approve it, then a GPU instance will be launched automatically.",
            }),
          });

          setInstanceType("");
          setWordlistID("");
          setRuleID("");
          setOpen(false);
        }}
      >
        <div className="grid gap-2">
          <label className="text-sm font-medium">
            GPU Instance Type
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              (g6.48xlarge recommended)
            </span>
          </label>
          <select
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={instanceType}
            onChange={(e) => setInstanceType(e.target.value)}
          >
            {instanceTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-yellow-600 dark:text-yellow-500">
            ⚠️ Change instance type at your own risk. Other instances may not be
            optimally cost-effective for your workload.
          </p>
        </div>
        <WordlistSelect value={wordlistID} onValueChange={setWordlistID} />
        <RuleSelect value={ruleID} onValueChange={setRuleID} />
        <Button disabled={!isValid}>{t("action.launch.text")}</Button>
      </form>
    </DrawerDialog>
  );
};

interface RemoveButtonProps {
  projectID: string;
  isLoading?: boolean;
}

const RemoveButton = ({ projectID, isLoading }: RemoveButtonProps) => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [open, setOpen] = useState(false);

  const { hasPermission } = useAuth();

  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.project.getMany, undefined, "any"),
      getQueryKey(trpc.project.getList, undefined, "any"),
    ],
    []
  );

  const { mutateAsync: deleteProjects } = trpc.project.deleteMany.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));

      navigate("/projects");
    },
    onError: handleError,
  });

  if (!hasPermission("projects:remove")) return <></>;

  return (
    <DrawerDialog
      title={t("action.remove.item", { item: t("item.project.singular") })}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline" disabled={isLoading}>
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

          await deleteProjects({
            projectIDs: [projectID!],
          });
        }}
      >
        <span>
          {t("action.remove.warn", {
            item: t("item.project.singular").toLowerCase(),
          })}
        </span>
        <Button>{t("action.remove.text")}</Button>
      </form>
    </DrawerDialog>
  );
};

export const ProjectPage = () => {
  const { projectID } = useParams();

  const { hasPermission } = useAuth();
  const trpc = useTRPC();

  const { handleError } = useErrors();

  const { uid } = useAuth();
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);

  const {
    data: project,
    isLoading,
    error,
    isLoadingError,
  } = trpc.project.get.useQuery(
    { projectID: projectID! },
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

  // Keep local pending request count in sync with server data for this user
  useEffect(() => {
    if (!project || !uid) {
      setPendingRequestsCount(0);
      return;
    }

    const jobs = (project.hashes ?? [])
      .flatMap((h) => h.jobs ?? [])
      .filter(
        (j) => j.approvalStatus === "PENDING" && j.submittedBy?.ID === uid
      );

    setPendingRequestsCount(jobs.length);
  }, [project, uid]);

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const hashes = useMemo(() => project?.hashes ?? [], [project]);

  const members = useMemo(() => project?.members ?? [], [project]);

  // All jobs (including pending approval) for PendingJobsSection
  const allJobs = useMemo(() => {
    const unfilteredJobs = (project?.hashes ?? [])
      .flatMap((hash) =>
        (hash?.jobs ?? []).map((job) => ({ ...job, type: hash.hashType }))
      )
      .filter((job) => job) as ProjectJobWithType[];

    const seenJobs: Record<string, boolean> = {};

    return unfilteredJobs.filter(({ JID }) => {
      if (seenJobs[JID]) return false;
      seenJobs[JID] = true;
      return true;
    });
  }, [project]);

  // Only approved jobs for the main jobs table
  const jobs = useMemo(() => {
    return allJobs.filter(({ approvalStatus }) => approvalStatus !== "PENDING");
  }, [allJobs]);

  const tables = [
    hasPermission("instances:jobs:get") && jobs.length > 0 && (
      <JobDataTable key="jobs" values={jobs} isLoading={isLoading} />
    ),
    hasPermission("hashes:get") && (
      <HashDataTable
        key="hashes"
        projectID={projectID ?? ""}
        values={hashes}
        isLoading={isLoading}
      />
    ),
    hasPermission("projects:users:get") && (
      <UserDataTable
        key="users"
        projectID={projectID ?? ""}
        values={members}
        isLoading={isLoading}
      />
    ),
  ];

  const separatedTables = tables
    .filter((value) => value)
    .flatMap((value, i) => [value, <Separator key={i} />]);
  separatedTables.pop();

  return (
    <div className="grid gap-4 p-4">
      <div className="flex gap-2">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {project?.name ?? "Project"}
        </span>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <LaunchButton
            key="launch"
            projectID={projectID!}
            hashes={project?.hashes}
            isLoading={isLoading}
            onRequestsSubmitted={(count) =>
              setPendingRequestsCount((c) => c + count)
            }
          />
          <RemoveButton
            key="remove"
            projectID={projectID!}
            isLoading={isLoading}
          />
        </div>
      </div>
      {pendingRequestsCount > 0 && (
        <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-3 dark:bg-yellow-950/20">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              ⏳ You have {pendingRequestsCount} job
              {pendingRequestsCount > 1 ? "s" : ""} waiting for approval. You
              will be notified when an admin approves them.
            </div>
            <div>
              <button
                className="text-sm text-yellow-700 underline"
                onClick={() => {
                  // scroll to pending jobs section
                  const el = document.querySelector("[data-pending-jobs]");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                View
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Pending Jobs Section */}
      <div data-pending-jobs>
        <PendingJobsSection projectID={projectID!} jobs={allJobs} />
      </div>
      {separatedTables}
    </div>
  );
};
