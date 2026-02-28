import { TRPCClientError } from "@trpc/client";
import {
  ArrowLeftIcon,
  FileTextIcon,
  HashIcon,
  ServerIcon,
  TrashIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { Status } from "@repo/api";
import { getHashName } from "@repo/hashcat/data";
import { Button } from "@repo/shadcn/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/shadcn/components/ui/card";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { JobStatusDisplay } from "@repo/ui/jobStatus";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";

import config from "../config.ts";

function getBackendUrl(): string {
  const protocol = window.location.protocol;
  let hostname: string;
  if (
    config.backend.name.length > 0 &&
    config.backend.name !== "USE_WEB_HOST"
  ) {
    hostname = config.backend.name;
  } else {
    hostname = window.location.hostname;
  }
  let port = "";
  if (
    config.backend.name.length > 0 &&
    config.backend.name !== "USE_WEB_HOST"
  ) {
    port = `:${config.backend.port}`;
  } else if (window.location.port.length > 0) {
    port = `:${window.location.port}`;
  }
  return `${protocol}//${hostname}${port}`;
}

export const JobPage = () => {
  const { jobID } = useParams();
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { hasPermission } = useAuth();
  const { handleError } = useErrors();
  const { toast } = useToast();

  const [cancelOpen, setCancelOpen] = useState(false);

  const {
    data: job,
    isLoading,
    error,
    isLoadingError,
  } = trpc.job.get.useQuery(
    { jobID: jobID! },
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

  const { mutateAsync: cancelJob } = trpc.job.cancel.useMutation({
    onSuccess() {
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

  const isRunningOrPending =
    job && !isTerminal(job.status) && job.approvalStatus !== "PENDING";

  const hashType = useMemo(() => {
    if (!job?.hashes?.length) return null;
    return job.hashes[0]!.hashType;
  }, [job]);

  const serverUrl = useMemo(() => getBackendUrl(), []);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="text-muted-foreground animate-pulse">
          Loading job...
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-4">
        <div className="text-muted-foreground">Job not found.</div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-2">
          {/* Back link to project */}
          {job.projects.length > 0 && job.projects[0] && (
            <Link
              to={`/projects/${job.projects[0].PID}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              {job.projects[0].name}
            </Link>
          )}
          <div className="flex items-center gap-3">
            <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Job {job.JID.slice(0, 8)}...
            </h1>
            <StatusBadge status={job.status as Status} />
          </div>
          {job.rejectionNote && (
            <p className="text-destructive text-sm">{job.rejectionNote}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!isTerminal(job.status) && (
            <DrawerDialog
              title={t("action.cancel.text", { defaultValue: "Cancel Job" })}
              open={cancelOpen}
              setOpen={setCancelOpen}
              trigger={
                <Button variant="destructive">
                  <TrashIcon className="mr-2 h-4 w-4" />
                  {t("action.cancel.text", { defaultValue: "Cancel" })}
                </Button>
              }
            >
              <form
                className="grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await cancelJob({ jobID: job.JID });
                  setCancelOpen(false);
                }}
              >
                <span>
                  Cancel this job? This will stop any running hashcat process.
                </span>
                <Button variant="destructive">
                  {t("action.cancel.text", { defaultValue: "Cancel Job" })}
                </Button>
              </form>
            </DrawerDialog>
          )}
        </div>
      </div>

      {/* Real-time Status (only for running jobs with an instance) */}
      {isRunningOrPending && job.instance && (
        <JobStatusDisplay
          instanceID={job.instance.tag}
          jobID={job.JID}
          serverUrl={serverUrl}
        />
      )}

      {/* Job Details & Instance Info Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Job Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileTextIcon className="h-5 w-5" />
              Job Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DetailRow label="Status">
              <StatusBadge status={job.status as Status} />
            </DetailRow>
            <DetailRow label="Approval">
              <span
                className={
                  job.approvalStatus === "APPROVED" ||
                  job.approvalStatus === "ORCHESTRATED"
                    ? "text-green-600"
                    : job.approvalStatus === "PENDING"
                      ? "text-yellow-600"
                      : "text-muted-foreground"
                }
              >
                {job.approvalStatus ?? "—"}
              </span>
            </DetailRow>
            {hashType !== null && (
              <DetailRow label="Hash Type">
                {getHashName(hashType)} ({hashType})
              </DetailRow>
            )}
            <DetailRow label="Hashes">
              {job.hashes.length} hash{job.hashes.length !== 1 ? "es" : ""}
            </DetailRow>
            {job.wordlist && (
              <DetailRow label="Wordlist">
                {job.wordlist.name || job.wordlist.WID}
              </DetailRow>
            )}
            {job.rule && (
              <DetailRow label="Rule">
                {job.rule.name || job.rule.RID}
              </DetailRow>
            )}
            {job.attackMode === 3 && (
              <DetailRow label="Attack Mode">Mask / Brute-force</DetailRow>
            )}
            {job.mask && (
              <DetailRow label="Mask">
                <code className="text-xs">{job.mask}</code>
              </DetailRow>
            )}
            {job.cascade && (
              <DetailRow label="Cascade">
                🔗 {job.cascade.name} (Step {(job.cascadeStepIndex ?? 0) + 1}/
                {job.cascade.totalSteps})
              </DetailRow>
            )}
            <DetailRow label="Instance Type">
              <span className="font-mono text-sm">
                {job.instanceType ?? "—"}
              </span>
            </DetailRow>
            <DetailRow label="Created">
              <RelativeTime time={job.createdAt} />
            </DetailRow>
            <DetailRow label="Updated">
              <RelativeTime time={job.updatedAt} />
            </DetailRow>
          </CardContent>
        </Card>

        {/* Instance/Machine Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ServerIcon className="h-5 w-5" />
              {job.instance ? "EC2 Instance" : "Instance"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {job.instance ? (
              <>
                <DetailRow label="Status">
                  <StatusBadge status={job.instance.status as Status} />
                </DetailRow>
                <DetailRow label="Name">{job.instance.name || "—"}</DetailRow>
                <DetailRow label="Tag">
                  <span className="font-mono text-xs">{job.instance.tag}</span>
                </DetailRow>
                <DetailRow label="Type">
                  <span className="font-mono text-sm">
                    {job.instance.type ?? "—"}
                  </span>
                </DetailRow>
                {hasPermission("root") && (
                  <DetailRow label="Instance ID">
                    <span className="font-mono text-xs">
                      {job.instance.IID}
                    </span>
                  </DetailRow>
                )}
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                {job.approvalStatus === "PENDING"
                  ? "Waiting for approval — instance will be created after approval."
                  : job.approvalStatus === "ORCHESTRATING"
                    ? "Instance is being provisioned..."
                    : "No instance assigned yet."}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* People Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserIcon className="h-5 w-5" />
            People
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <DetailRow label="Submitted by">
            {job.submittedBy ? (
              <Link
                to={`/users/${job.submittedBy.ID}`}
                className="text-primary hover:underline"
              >
                {job.submittedBy.username}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Approved by">
            {job.approvedBy ? (
              <>
                <Link
                  to={`/users/${job.approvedBy.ID}`}
                  className="text-primary hover:underline"
                >
                  {job.approvedBy.username}
                </Link>
                {job.approvedAt && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    (<RelativeTime time={job.approvedAt} />)
                  </span>
                )}
              </>
            ) : (
              "—"
            )}
          </DetailRow>
        </CardContent>
      </Card>

      {/* Hashes Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HashIcon className="h-5 w-5" />
            Hashes ({job.hashes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left font-medium">Hash</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Source</th>
                  <th className="pb-2 text-left font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {job.hashes.map((hash) => (
                  <tr key={hash.HID} className="border-b last:border-0">
                    <td className="max-w-48 truncate py-2 font-mono text-xs">
                      {hash.hash}
                    </td>
                    <td className="py-2">{getHashName(hash.hashType)}</td>
                    <td className="py-2">
                      <StatusBadge status={hash.status as Status} />
                    </td>
                    <td className="py-2">
                      {hash.source === "KNOWN" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          🧠 Known
                        </span>
                      ) : hash.source === "GPU" ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          🖥 GPU
                        </span>
                      ) : hash.source === "SHUCKED" ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          🌽 Shucked
                        </span>
                      ) : hash.source === "DUPLICATE" ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ♻ Duplicate
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs text-green-600">
                      {hash.value || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Projects */}
      {job.projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {job.projects.map((project) => (
                <Link
                  key={project.PID}
                  to={`/projects/${project.PID}`}
                  className="text-primary hover:underline"
                >
                  {project.name}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/** Small helper for label-value rows */
const DetailRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
    <span className="text-muted-foreground text-sm">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);
