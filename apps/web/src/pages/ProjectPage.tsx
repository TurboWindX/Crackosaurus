import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { APIError, Status } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type ProjectJob } from "@repo/api/server";
import { type REQ, type RES } from "@repo/api/server/client/web";
import { HASH_TYPES, getHashName } from "@repo/hashcat/data";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { InstanceSelect } from "@repo/ui/clusters";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { HashTypeSelect } from "@repo/ui/hashes";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { UserSelect } from "@repo/ui/users";
import { WordlistSelect } from "@repo/ui/wordlists";

type ProjectJobWithType = ProjectJob & { type: number };

const HASH_IMPORT_VALIDATOR = z
  .object({
    hash: z.string(),
    type: z.number().int().min(0),
  })
  .array();

interface HashDataTableProps {
  projectID: string;
  values: RES<APIType["getProject"]>["hashes"];
  isLoading?: boolean;
}

const HashDataTable = ({
  projectID,
  values,
  isLoading,
}: HashDataTableProps) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const [newHash, setNewHash] = useState<
    REQ<APIType["addHashes"]>["data"][number]
  >({
    hash: "",
    hashType: HASH_TYPES.plaintext,
  });

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const [viewOpen, setViewOpen] = useState(false);
  const [viewHashID, setViewHashID] = useState<string | null>(null);
  const viewHash = useMemo(
    () => values?.find((hash) => hash.HID === viewHashID)?.value,
    [viewHashID]
  );

  const { mutateAsync: addHashes } = useMutation({
    mutationFn: API.addHashes,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: removeHashes } = useMutation({
    mutationFn: (hashIDs: string[]) => API.removeHashes({ projectID, hashIDs }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
    onError: handleError,
  });

  return (
    <>
      <DrawerDialog
        title={t("item.hash.singular")}
        open={viewOpen}
        setOpen={setViewOpen}
      >
        {viewHash ?? t("error.not_found")}
      </DrawerDialog>
      <DataTable
        singular={t("item.hash.singular")}
        plural={t("item.hash.plural")}
        values={values ?? []}
        head={[
          t("item.hash.singular"),
          t("item.type.singular"),
          t("item.status"),
          t("item.time.update"),
        ]}
        valueKey={({ HID }) => HID}
        isLoading={isLoading}
        row={({ hash, hashType, status, updatedAt }) => [
          <div className="max-w-32 truncate md:max-w-64 lg:max-w-[50vw]">
            {hash}
          </div>,
          getHashName(hashType),
          <StatusBadge status={status as Status} />,
          <RelativeTime time={updatedAt} />,
        ]}
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
          await removeHashes(hashes.map(({ HID }) => HID));
          return true;
        }}
        noImport={!hasPermission("hashes:add")}
        onImport={async (data) => {
          const result = HASH_IMPORT_VALIDATOR.safeParse(data);
          if (result.error) {
            console.log(result.error.format());
            handleError(new APIError({ code: 500, message: "input" }));
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
      rowClick={({ instance }) => navigate(`/instances/${instance.IID}`)}
      isLoading={isLoading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, type, status, updatedAt, instance }) => [
        JID,
        getHashName(type),
        instance.name || instance.IID,
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
  values: RES<APIType["getProject"]>["members"];
  isLoading?: boolean;
}

const UserDataTable = ({
  projectID,
  values,
  isLoading,
}: UserDataTableProps) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const [newUserID, setNewUserID] = useState<string>("");

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: addUser } = useMutation({
    mutationFn: (userID: string) =>
      API.addUsersToProject({ projectID, userIDs: [userID] }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: removeUsers } = useMutation({
    mutationFn: (userIDs: string[]) =>
      API.removeUsersFromProject({ projectID, userIDs }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
    onError: handleError,
  });

  return (
    <DataTable
      singular={t("item.user.singular")}
      plural={t("item.user.plural")}
      values={values ?? []}
      head={[t("item.user.singular")]}
      valueKey={({ ID }) => ID}
      row={({ username }) => [username]}
      isLoading={isLoading}
      searchFilter={({ username }, search) =>
        username.toLowerCase().includes(search)
      }
      sort={(a, b) => a.username.localeCompare(b.username)}
      addValidate={() => newUserID.length > 0}
      addDialog={
        <>
          <UserSelect
            value={newUserID}
            onValueChange={(userID) => setNewUserID(userID)}
            filter={({ ID }) =>
              (values ?? []).every((member) => ID !== member.ID) === true
            }
          />
        </>
      }
      noAdd={!hasPermission("projects:users:add")}
      onAdd={async () => {
        await addUser(newUserID);

        setNewUserID("");

        return true;
      }}
      noRemove={!hasPermission("projects:users:remove")}
      onRemove={async (users) => {
        await removeUsers(users.map(({ ID }) => ID));
        return true;
      }}
    />
  );
};

interface LaunchButtonProps {
  projectID: string;
  hashes: RES<APIType["getProject"]>["hashes"];
  isLoading: boolean;
}

const LaunchButton = ({ projectID, isLoading, hashes }: LaunchButtonProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const [instanceID, setInstanceID] = useState("");
  const [wordlistID, setWordlistID] = useState("");

  const todoHashes = useMemo(
    () => (hashes ?? []).filter((hash) => typeof hash.value !== "string"),
    [hashes]
  );
  const hasTodoHashes = useMemo(() => todoHashes.length > 0, [todoHashes]);

  const isValid = useMemo(
    () => instanceID.length > 0 && wordlistID.length > 0 && hasTodoHashes,
    [instanceID, wordlistID, hasTodoHashes]
  );

  const { hasPermission } = useAuth();

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: addJobs } = useMutation({
    mutationFn: ({
      instanceID,
      wordlistID,
      hashTypes,
    }: {
      instanceID: string;
      wordlistID: string;
      hashTypes: number[];
    }) =>
      API.createInstanceJobs({
        instanceID,
        data: hashTypes.map((hashType) => ({
          wordlistID,
          hashType,
          projectIDs: [projectID],
        })),
      }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["projects", projectID] });
    },
    onError: handleError,
  });

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

          await addJobs({
            instanceID,
            wordlistID,
            hashTypes: [...new Set(todoHashes.map(({ hashType }) => hashType))],
          });

          setInstanceID("");
          setWordlistID("");
          setOpen(false);
        }}
      >
        <InstanceSelect value={instanceID} onValueChange={setInstanceID} />
        <WordlistSelect value={wordlistID} onValueChange={setWordlistID} />
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
  const [open, setOpen] = useState(false);

  const { hasPermission } = useAuth();

  const navigate = useNavigate();

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: deleteProject } = useMutation({
    mutationFn: async (projectID: string) =>
      API.deleteProjects({ projectIDs: [projectID] }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });

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

          await deleteProject(projectID!);
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

  const API = useAPI();
  const { handleError } = useErrors();

  const {
    data: project,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["projects", projectID],
    queryFn: async () => API.getProject({ projectID: projectID! }),
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

  const hashes = useMemo(() => project?.hashes ?? [], [project]);

  const members = useMemo(() => project?.members ?? [], [project]);

  const jobs = useMemo(() => {
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
          />
          <RemoveButton
            key="remove"
            projectID={projectID!}
            isLoading={isLoading}
          />
        </div>
      </div>
      {separatedTables}
    </div>
  );
};
