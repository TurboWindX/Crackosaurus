import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { CheckIcon, PlayIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Status } from "@repo/api";
import {
  DEFAULT_INSTANCE_TYPE,
  INSTANCE_TYPES,
} from "@repo/app-config/instance-types";
import { HASH_TYPES, getHashName } from "@repo/hashcat/data";
import { identifyHash, identifyHashBatch } from "@repo/hashcat/identify";
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
import { MaskInput } from "@repo/ui/masks";
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
  onSelectionChange?: (ids: string[]) => void;
}

const HashDataTable = ({
  projectID,
  values,
  isLoading,
  onSelectionChange,
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

  // Auto-detect hash type when user types/pastes a hash
  const [hashDetection, setHashDetection] = useState<string | null>(null);
  useEffect(() => {
    const trimmed = newHash.hash.trim();
    if (trimmed.length === 0) {
      setHashDetection(null);
      return;
    }
    const candidates = identifyHash(trimmed);
    if (candidates.length > 0) {
      const best = candidates[0]!;
      // Auto-set on high confidence, suggest on medium
      if (best.confidence === "high") {
        if (
          newHash.hashType === HASH_TYPES.plaintext ||
          newHash.hashType === 0
        ) {
          setNewHash((prev) => ({ ...prev, hashType: best.mode }));
        }
        setHashDetection(`Detected: ${best.name}`);
      } else {
        // Auto-set medium confidence too if user hasn't picked yet
        if (
          newHash.hashType === HASH_TYPES.plaintext ||
          newHash.hashType === 0
        ) {
          setNewHash((prev) => ({ ...prev, hashType: best.mode }));
        }
        const names = candidates
          .filter((c) => c.confidence !== "low")
          .map((c) => c.name)
          .slice(0, 3);
        setHashDetection(
          candidates.length > 1
            ? `Likely: ${names.join(" / ")}`
            : `Likely: ${best.name}`
        );
      }
    } else {
      setHashDetection(null);
    }
  }, [newHash.hash]);

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

  const handleSelectionChange = (selectedValues: unknown[]) => {
    if (!onSelectionChange) return;
    const selectedTodoHashIDs = Array.from(
      new Set(
        (selectedValues as Array<Record<string, unknown>>)
          .filter((h) => typeof h?.value !== "string")
          .map((h) => h.HID as string)
          .filter((id) => typeof id === "string" && id.length > 0)
      )
    );
    onSelectionChange(selectedTodoHashIDs);
  };

  const parseImportData = (contents: string) => {
    try {
      const data = JSON.parse(contents);
      if (Array.isArray(data)) return data;
    } catch {
      // not JSON, try as text
    }
    // Parse as newline-separated hashes, use selected type
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Auto-detect hash type from first line if user hasn't changed from default
    if (lines.length > 0 && importHashType === HASH_TYPES.plaintext) {
      const candidates = identifyHashBatch(lines);
      if (candidates.length > 0) {
        setImportHashType(candidates[0]!.mode);
        return lines.map((hash) => ({ hash, type: candidates[0]!.mode }));
      }
    }

    return lines.map((hash) => ({ hash, type: importHashType }));
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
          source?: string | null;
        }) => {
          const { hash, hashType, status, updatedAt, source } = value;
          return [
            <div className="max-w-32 truncate md:max-w-64 lg:max-w-[50vw]">
              {hash}
            </div>,
            getHashName(hashType),
            <span className="inline-flex items-center gap-1">
              <StatusBadge status={status as Status} />
              {source === "KNOWN" && (
                <span
                  title="Previously cracked (known hash)"
                  className="text-xs"
                >
                  🧠
                </span>
              )}
              {source === "SHUCKED" && (
                <span title="Cracked via NT hash shucking" className="text-xs">
                  🌽
                </span>
              )}
              {source === "DUPLICATE" && (
                <span
                  title="Already cracked in another project"
                  className="text-xs text-green-500"
                >
                  ♻
                </span>
              )}
            </span>,
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
            {hashDetection && (
              <p className="text-muted-foreground text-xs">
                🔍 {hashDetection}
              </p>
            )}
            <HashTypeSelect
              value={newHash.hashType}
              onValueChange={(hashType) => setNewHash({ ...newHash, hashType })}
            />
          </>
        }
        onSelectionChange={handleSelectionChange}
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
    onSuccess(ok) {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      if (!ok) {
        toast({
          title: t("error.unknown", { defaultValue: "Error" }),
          description: t("message.job.approve.failed", {
            defaultValue:
              "Approval did not complete successfully. Check server/cluster logs.",
          }),
          variant: "destructive",
        });
        return;
      }

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

  const { mutateAsync: cancelPending } = trpc.job.cancelPending.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      toast({
        title: t("message.job.cancelled", { defaultValue: "Job Cancelled" }),
        description: t("message.job.cancelled.description", {
          defaultValue: "The pending job request has been cancelled.",
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
              <div className="ml-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    const ok = window.confirm(
                      "Cancel this pending job request?"
                    );
                    if (!ok) return;
                    await cancelPending({ jobID: job.JID });
                  }}
                >
                  <TrashIcon className="mr-1 h-4 w-4" />
                  {t("action.cancel.text", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveOne({ jobID: job.JID })}
                >
                  <CheckIcon className="mr-1 h-4 w-4" />
                  {t("action.approve", { defaultValue: "Approve" })}
                </Button>
              </div>
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
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    const ok = window.confirm(
                      "Cancel this pending job request?"
                    );
                    if (!ok) return;
                    await cancelPending({ jobID: job.JID });
                  }}
                >
                  <TrashIcon className="mr-1 h-4 w-4" />
                  {t("action.cancel.text", { defaultValue: "Cancel" })}
                </Button>
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
  projectID: string;
  values: ProjectJobWithType[];
  isLoading?: boolean;
}

const JobDataTable = ({ projectID, values, isLoading }: JobDataTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();
  const { toast } = useToast();

  // Collect running job IDs to poll progress for
  const runningJobIDs = useMemo(
    () =>
      (values ?? []).filter((j) => j.status === "RUNNING").map((j) => j.JID),
    [values]
  );

  const { data: progressData } = trpc.job.progressBulk.useQuery(
    { jobIDs: runningJobIDs },
    {
      enabled: runningJobIDs.length > 0,
      refetchInterval: 15_000, // Poll every 15s (hashcat status timer is 10s)
      keepPreviousData: true,
    }
  );

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.project.get, { projectID }, "any"),
      getQueryKey(trpc.project.getMany, undefined, "any"),
    ],
    [projectID]
  );

  const { mutateAsync: cancelJob, isLoading: isCancelling } =
    trpc.job.cancel.useMutation({
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
        toast({
          title: t("message.job.cancelled", { defaultValue: "Job Cancelled" }),
          description: t("message.job.cancelled.running", {
            defaultValue: "The job has been cancelled.",
          }),
        });
      },
      onError: handleError,
    });

  const isTerminal = (status: string) =>
    status === "COMPLETE" || status === "STOPPED" || status === "ERROR";

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
        "", // Actions column
      ]}
      valueKey={({ JID }) => JID}
      rowClick={({ JID }) => navigate(`/jobs/${JID}`)}
      isLoading={isLoading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, type, status, updatedAt, instance, instanceType }) => {
        const progress = progressData?.[JID];
        const statusCell =
          status === "RUNNING" && progress ? (
            <div className="flex flex-col gap-0.5">
              <StatusBadge status={status as Status} />
              <span className="text-muted-foreground text-xs">
                {progress.progressPercent.toFixed(1)}% ·{" "}
                {progress.speedFormatted} · ETA {progress.eta}
              </span>
            </div>
          ) : (
            <StatusBadge status={status as Status} />
          );

        return [
          JID,
          getHashName(type),
          instance ? instance.name || instance.IID : instanceType || "Pending",
          statusCell,
          <RelativeTime time={updatedAt} />,
          !isTerminal(status) ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={isCancelling}
              onClick={async (e) => {
                e.stopPropagation();
                const ok = window.confirm(
                  "Cancel this job? This will stop the running hashcat process."
                );
                if (!ok) return;
                await cancelJob({ jobID: JID });
              }}
            >
              <TrashIcon className="mr-1 h-4 w-4" />
              {t("action.cancel.text", { defaultValue: "Cancel" })}
            </Button>
          ) : null,
        ];
      }}
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
  selectedHashIDs?: string[];
  // callback to inform parent that N job requests were submitted
  onRequestsSubmitted?: (count: number) => void;
}

const LaunchButton = ({
  projectID,
  isLoading,
  hashes,
  selectedHashIDs = [],
  onRequestsSubmitted,
}: LaunchButtonProps) => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [open, setOpen] = useState(false);

  const [launchMode, setLaunchMode] = useState<"single" | "cascade">("single");
  const [instanceType, setInstanceType] = useState(DEFAULT_INSTANCE_TYPE);
  const [wordlistID, setWordlistID] = useState("");
  const [ruleID, setRuleID] = useState("");
  const [attackMode, setAttackMode] = useState(0);
  const [mask, setMask] = useState("");
  const [selectedCascadeID, setSelectedCascadeID] = useState("");

  const todoHashes = useMemo(
    () =>
      (hashes ?? []).filter(
        (hash: { value?: string | null }) => typeof hash.value !== "string"
      ),
    [hashes]
  );
  const hasTodoHashes = useMemo(() => todoHashes.length > 0, [todoHashes]);

  const isValid = useMemo(() => {
    if (!hasTodoHashes) return false;
    if (launchMode === "cascade") {
      return selectedCascadeID.length > 0;
    }
    // Single mode
    if (attackMode === 3) {
      return instanceType.length > 0 && mask.length > 0;
    }
    return instanceType.length > 0 && wordlistID.length > 0;
  }, [
    instanceType,
    wordlistID,
    hasTodoHashes,
    launchMode,
    selectedCascadeID,
    attackMode,
    mask,
  ]);

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

  const { mutateAsync: requestJobsForHashes } =
    trpc.job.requestJobsForHashes.useMutation({
      onSuccess(data) {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
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

  // Fetch GPU instance availability from the cluster
  const { data: availability } = trpc.instance.getAvailability.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  // Fetch cascade templates
  const { data: cascades } = trpc.cascade.getMany.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  // Selected cascade details (for getting step 0 when launching)
  const { data: selectedCascade } = trpc.cascade.get.useQuery(
    { cascadeID: selectedCascadeID },
    { enabled: selectedCascadeID.length > 0 }
  );

  if (!hasPermission("instances:jobs:add")) return <></>;

  const launchLabel =
    selectedHashIDs.length > 0
      ? `${t("action.launch.text")} (${selectedHashIDs.length} selected)`
      : t("action.launch.text");

  const isAvailableType =
    !availability || availability[instanceType]?.available !== false;

  return (
    <DrawerDialog
      title={t("action.launch.item", { item: t("item.project.singular") })}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline" disabled={isLoading || !hasTodoHashes}>
          <div className="grid grid-flow-col items-center gap-2">
            <PlayIcon />
            <span>{launchLabel}</span>
          </div>
        </Button>
      }
    >
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();

          if (launchMode === "cascade" && selectedCascade) {
            // Launch cascade: use step 0's config
            const step0 = selectedCascade.steps.find((s) => s.order === 0);
            if (!step0) return;

            const cascadeInstanceType = step0.instanceType || instanceType;
            const targetHashIDs =
              selectedHashIDs.length > 0
                ? selectedHashIDs
                : todoHashes.map((h: { HID: string }) => h.HID);

            const created = await requestJobsForHashes({
              instanceType: cascadeInstanceType,
              wordlistID: step0.wordlistId ?? undefined,
              ruleID: step0.ruleId ?? undefined,
              hashIDs: targetHashIDs,
              attackMode: step0.attackMode,
              mask: step0.mask ?? undefined,
              cascadeId: selectedCascade.CID,
              cascadeStepIndex: 0,
            });
            void created;
          } else if (selectedHashIDs.length > 0) {
            const created = await requestJobsForHashes({
              instanceType,
              wordlistID: attackMode === 3 ? undefined : wordlistID,
              ruleID: ruleID || undefined,
              hashIDs: selectedHashIDs,
              attackMode,
              mask: attackMode === 3 ? mask : undefined,
            });
            void created;
          } else {
            const hashTypes = Array.from(
              new Set(
                todoHashes.map((h: { hashType?: number | string }) =>
                  Number(h.hashType)
                )
              )
            ) as number[];

            const created = await requestJobs({
              instanceType,
              data: hashTypes.map((hashType) => ({
                wordlistID,
                ruleID: ruleID || undefined,
                hashType,
                projectIDs: [projectID],
              })),
            });
            void created;
          }

          toast({
            title:
              launchMode === "cascade"
                ? "Cascade Submitted for Approval"
                : t("message.job.submitted.title", {
                    defaultValue: "Job Submitted for Approval",
                  }),
            description:
              launchMode === "cascade"
                ? `Cascade "${selectedCascade?.name}" started with ${selectedCascade?.steps.length} step(s). Jobs will auto-advance as each step completes.`
                : t("message.job.submitted.description", {
                    defaultValue:
                      "Your job request has been submitted. An admin will review and approve it, then a GPU instance will be launched automatically.",
                  }),
          });

          setInstanceType(DEFAULT_INSTANCE_TYPE);
          setWordlistID("");
          setRuleID("");
          setAttackMode(0);
          setMask("");
          setSelectedCascadeID("");
          setLaunchMode("single");
          setOpen(false);
        }}
      >
        {/* Mode toggle */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">Launch Mode</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={launchMode === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => setLaunchMode("single")}
            >
              Single Attack
            </Button>
            <Button
              type="button"
              variant={launchMode === "cascade" ? "default" : "outline"}
              size="sm"
              onClick={() => setLaunchMode("cascade")}
            >
              🔗 Cascade
            </Button>
          </div>
        </div>

        {launchMode === "cascade" ? (
          <>
            {/* Cascade selector */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Cascade Template</label>
              {cascades && cascades.length > 0 ? (
                <select
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  value={selectedCascadeID}
                  onChange={(e) => setSelectedCascadeID(e.target.value)}
                >
                  <option value="">Select a cascade...</option>
                  {cascades.map((c) => (
                    <option key={c.CID} value={c.CID}>
                      {c.name} ({c.stepCount} step{c.stepCount !== 1 ? "s" : ""}
                      )
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No cascade templates yet. Create one from the Cascades page.
                </p>
              )}
              {selectedCascade && (
                <div className="bg-muted rounded-md p-3 text-sm">
                  <p className="mb-1 font-medium">{selectedCascade.name}</p>
                  {selectedCascade.steps.map((step) => (
                    <div
                      key={step.CSID}
                      className="text-muted-foreground flex items-center gap-2 text-xs"
                    >
                      <span className="font-mono">Step {step.order + 1}:</span>
                      {step.attackMode === 3 ? (
                        <span>
                          Mask: <code>{step.mask}</code>
                        </span>
                      ) : (
                        <span>
                          Dictionary
                          {step.wordlist
                            ? `: ${step.wordlist.name ?? step.wordlistId}`
                            : ""}
                          {step.rule
                            ? ` + ${step.rule.name ?? step.ruleId}`
                            : ""}
                        </span>
                      )}
                      {step.instanceType && (
                        <span className="ml-auto">{step.instanceType}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Instance type override (used as fallback when step doesn't specify) */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                Default GPU Instance Type
              </label>
              <select
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={instanceType}
                onChange={(e) => setInstanceType(e.target.value)}
              >
                {instanceTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            {/* Attack mode selector */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Attack Mode</label>
              <select
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={attackMode}
                onChange={(e) => setAttackMode(Number(e.target.value))}
              >
                <option value={0}>Dictionary Attack</option>
                <option value={3}>Mask / Brute-force Attack</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                GPU Instance Type
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  (g6.12xlarge recommended)
                </span>
              </label>
              <select
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={instanceType}
                onChange={(e) => setInstanceType(e.target.value)}
              >
                {instanceTypes.map((type) => {
                  const info = availability?.[type.value];
                  const avail = !availability || info?.available !== false;
                  const prefix = availability
                    ? avail
                      ? "\u2705 "
                      : "\u274C "
                    : "";
                  return (
                    <option key={type.value} value={type.value}>
                      {prefix}
                      {type.label}
                      {!avail ? " (not available in region)" : ""}
                    </option>
                  );
                })}
              </select>
              {availability &&
                availability[instanceType]?.available === false && (
                  <p className="text-destructive text-xs">
                    This instance type is not available in the current AWS
                    region. The job will fail to launch. Please select a
                    different type.
                  </p>
                )}
            </div>
            {attackMode === 3 ? (
              <MaskInput value={mask} onChange={setMask} />
            ) : (
              <>
                <WordlistSelect
                  value={wordlistID}
                  onValueChange={setWordlistID}
                />
                <RuleSelect value={ruleID} onValueChange={setRuleID} />
              </>
            )}
          </>
        )}
        <Button disabled={!isValid || !isAvailableType}>
          {t("action.launch.text")}
        </Button>
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
  const [selectedHashIDs, setSelectedHashIDs] = useState<string[]>([]);

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
      <JobDataTable
        key="jobs"
        projectID={projectID!}
        values={jobs}
        isLoading={isLoading}
      />
    ),
    hasPermission("hashes:get") && (
      <HashDataTable
        key="hashes"
        projectID={projectID ?? ""}
        values={hashes}
        isLoading={isLoading}
        onSelectionChange={(ids) => setSelectedHashIDs(ids)}
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
            selectedHashIDs={selectedHashIDs}
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
