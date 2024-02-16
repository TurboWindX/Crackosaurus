import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ACTIVE_STATUSES, HASH_TYPES, HashType, Status } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { ProjectJob } from "@repo/api/server";
import { type REQ, type RES } from "@repo/api/server/client/web";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { UserSelect } from "@repo/ui/users";

interface HashDataTableProps {
  projectID: string;
  values: RES<APIType["getProject"]>["hashes"];
  loading?: boolean;
}

const HashDataTable = ({ projectID, values, loading }: HashDataTableProps) => {
  const { hasPermission } = useAuth();

  const [newHash, setNewHash] = useState<REQ<APIType["addHash"]>>({
    projectID,
    hash: "",
    hashType: "" as HashType,
  });

  const API = useAPI();
  const queryClient = useQueryClient();

  const { mutateAsync: addHash } = useMutation({
    mutationFn: API.addHash,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
  });

  const { mutateAsync: removeHashes } = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(
        ids.map((hashID) => API.removeHash({ projectID, hashID }))
      ),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
  });

  return (
    <DataTable
      type="Hash"
      pluralSuffix="es"
      values={values ?? []}
      head={["Hash", "Type", "Status"]}
      valueKey={({ HID }) => HID}
      isLoading={loading}
      row={({ hash, hashType, status }) => [
        hash,
        hashType,
        <StatusBadge status={status as any} />,
      ]}
      noAdd={!hasPermission("hashes:add")}
      onAdd={async () => {
        await addHash(newHash);
        return true;
      }}
      noRemove={!hasPermission("hashes:remove")}
      onRemove={async (hashes) => {
        await removeHashes(hashes.map(({ HID }) => HID));
        return true;
      }}
      searchFilter={({ hash, hashType }, search) =>
        hash.toLowerCase().includes(search.toLowerCase()) ||
        hashType.toLowerCase().includes(search.toLowerCase())
      }
      addValidate={() =>
        newHash.hash.trim().length > 0 && newHash.hashType.trim().length > 0
      }
      addDialog={
        <>
          <Input
            placeholder="Value"
            value={newHash.hash}
            onChange={(e) =>
              setNewHash({
                ...newHash,
                hash: e.target.value,
              })
            }
          />
          <Select
            value={newHash.hashType}
            onValueChange={(value) =>
              setNewHash({
                ...newHash,
                hashType: value as HashType,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Type</SelectLabel>
                {HASH_TYPES.map((type) => (
                  <SelectItem value={type}>{type}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </>
      }
    />
  );
};

interface JobDataTableProps {
  values: ProjectJob[];
  loading?: boolean;
}

const JobDataTable = ({ values, loading }: JobDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Job"
      values={values ?? []}
      head={["Job", "Instance", "Status", "Last Updated"]}
      valueKey={({ JID }) => JID}
      rowClick={({ instance }) => navigate(`/instances/${instance.IID}`)}
      isLoading={loading}
      sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
      row={({ JID, status, updatedAt, instance }) => [
        JID,
        instance.name || instance.IID,
        <StatusBadge status={status as any} />,
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
  loading?: boolean;
}

const UserDataTable = ({ projectID, values, loading }: UserDataTableProps) => {
  const { hasPermission } = useAuth();

  const [newUser, setNewUser] = useState<REQ<APIType["addUserToProject"]>>({
    projectID,
    userID: "",
  });

  const API = useAPI();
  const queryClient = useQueryClient();

  const { mutateAsync: addUser } = useMutation({
    mutationFn: API.addUserToProject,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
  });

  const { mutateAsync: removeUsers } = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(
        ids.map((userID) => API.removeUserFromProject({ projectID, userID }))
      ),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectID],
      });
    },
  });

  return (
    <DataTable
      type="User"
      values={values ?? []}
      head={["User"]}
      valueKey={({ ID }) => ID}
      row={({ username }) => [username]}
      isLoading={loading}
      searchFilter={({ username }, search) =>
        username.toLowerCase().includes(search)
      }
      sort={(a, b) => a.username.localeCompare(b.username)}
      addValidate={() => addUser !== null}
      addDialog={
        <>
          <UserSelect
            value={newUser.userID}
            onValueChange={(userID) => setNewUser({ ...newUser, userID })}
            filter={({ ID }) =>
              (values ?? []).every((member) => ID !== member.ID) === true
            }
          />
        </>
      }
      noAdd={!hasPermission("projects:users:add")}
      onAdd={async () => {
        await addUser(newUser);
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

export const ProjectPage = () => {
  const { projectID } = useParams();

  const API = useAPI();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["projects", projectID],
    queryFn: async () => API.getProject({ projectID: projectID ?? "" }),
  });

  const { mutateAsync: deleteProject } = useMutation({
    mutationFn: async (projectID: string) => API.deleteProject({ projectID }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });

      navigate("/projects");
    },
  });

  const [removeOpen, setRemoveOpen] = useState(false);

  const hashes = useMemo(() => project?.hashes ?? [], [project]);

  const members = useMemo(() => project?.members ?? [], [project]);

  const jobs = useMemo(() => {
    const unfilteredJobs = (project?.hashes ?? [])
      .flatMap((hash) => hash.jobs)
      .filter((job) => job) as ProjectJob[];
    const seenJobs: Record<string, boolean> = {};

    return unfilteredJobs.filter(({ JID }) => {
      if (seenJobs[JID]) return false;
      seenJobs[JID] = true;

      return true;
    });
  }, [project]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => ACTIVE_STATUSES[job.status as Status]),
    [jobs]
  );

  const tables = [
    hasPermission("instances:jobs:get") && activeJobs.length > 0 && (
      <JobDataTable key="jobs" values={activeJobs} loading={projectLoading} />
    ),
    hasPermission("hashes:get") && (
      <HashDataTable
        key="hashes"
        projectID={projectID ?? ""}
        values={hashes}
        loading={projectLoading}
      />
    ),
    hasPermission("projects:users:get") && (
      <UserDataTable
        key="users"
        projectID={projectID ?? ""}
        values={members}
        loading={projectLoading}
      />
    ),
  ];

  const separatedTables = tables
    .filter((value) => value)
    .flatMap((value) => [value, <Separator />]);
  separatedTables.pop();

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {project?.name ?? "Project"}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {hasPermission("projects:remove") && (
            <div className="w-max">
              <DrawerDialog
                title="Remove Project"
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

                    await deleteProject(projectID ?? "");
                  }}
                >
                  <span>Do you want to permanently remove this project?</span>
                  <Button>Remove</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
        </div>
      </div>
      {separatedTables}
    </div>
  );
};
