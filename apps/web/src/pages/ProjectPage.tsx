import { TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ACTIVE_STATUSES,
  AddHashRequest,
  GetProjectJob,
  GetProjectResponse,
  HASH_TYPES,
  Status,
} from "@repo/api";
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
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useProjects } from "@repo/ui/projects";
import { useLoading } from "@repo/ui/requests";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { UserSelect } from "@repo/ui/users";

interface HashDataTableProps {
  projectID: string;
  values: GetProjectResponse["response"]["hashes"];
  loading?: boolean;
}

const HashDataTable = ({ projectID, values, loading }: HashDataTableProps) => {
  const { hasPermission } = useAuth();
  const { addHashes, removeHashes } = useProjects();

  const [addHash, setAddHash] = useState<AddHashRequest["Body"]>({
    hash: "",
    hashType: "",
  });

  return (
    <DataTable
      type="Hash"
      pluralSuffix="es"
      values={values ?? []}
      head={["Hash", "Type", "Status"]}
      valueKey={({ HID }) => HID}
      loading={loading}
      row={({ hash, hashType, status }) => [
        hash,
        hashType,
        <StatusBadge status={status as any} />,
      ]}
      noAdd={!hasPermission("hashes:add")}
      onAdd={() => addHashes(projectID, addHash)}
      noRemove={!hasPermission("hashes:remove")}
      onRemove={(hashes) =>
        removeHashes(projectID, ...hashes.map(({ HID }) => HID))
      }
      searchFilter={({ hash, hashType }, search) =>
        hash.toLowerCase().includes(search.toLowerCase()) ||
        hashType.toLowerCase().includes(search.toLowerCase())
      }
      addValidate={() =>
        addHash.hash.trim().length > 0 && addHash.hashType.trim().length > 0
      }
      addDialog={
        <>
          <Input
            placeholder="Value"
            value={addHash.hash}
            onChange={(e) =>
              setAddHash({
                ...addHash,
                hash: e.target.value,
              })
            }
          />
          <Select
            value={addHash.hashType}
            onValueChange={(value) =>
              setAddHash({
                ...addHash,
                hashType: value,
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
  values: GetProjectJob[];
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
      loading={loading}
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
  values: GetProjectResponse["response"]["members"];
  loading?: boolean;
}

const UserDataTable = ({ projectID, values, loading }: UserDataTableProps) => {
  const { hasPermission } = useAuth();
  const { addUsers, removeUsers } = useProjects();

  const [addUser, setAddUser] = useState<string | null>(null);

  return (
    <DataTable
      type="User"
      values={values ?? []}
      head={["User"]}
      valueKey={({ ID }) => ID}
      row={({ username }) => [username]}
      loading={loading}
      searchFilter={({ username }, search) =>
        username.toLowerCase().includes(search)
      }
      sort={(a, b) => a.username.localeCompare(b.username)}
      addValidate={() => addUser !== null}
      addDialog={
        <>
          <UserSelect
            value={addUser}
            onValueChange={setAddUser}
            filter={({ ID }) =>
              (values ?? []).every((member) => ID !== member.ID) === true
            }
          />
        </>
      }
      noAdd={!hasPermission("projects:users:add")}
      onAdd={() => addUsers(projectID, addUser ?? "")}
      noRemove={!hasPermission("projects:users:remove")}
      onRemove={(users) => removeUsers(projectID, ...users.map(({ ID }) => ID))}
    />
  );
};

export const ProjectPage = () => {
  const { projectID } = useParams();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const {
    project: one,
    loadProject: loadOne,
    removeProjects: remove,
  } = useProjects();

  const [removeOpen, setRemoveOpen] = useState(false);

  const hashes = useMemo(() => one?.hashes ?? [], [one]);

  const members = useMemo(() => one?.members ?? [], [one]);

  const jobs = useMemo(() => {
    const unfilteredJobs = (one?.hashes ?? [])
      .flatMap((hash) => hash.jobs)
      .filter((job) => job) as GetProjectJob[];
    const seenJobs: Record<string, boolean> = {};

    return unfilteredJobs.filter(({ JID }) => {
      if (seenJobs[JID]) return false;
      seenJobs[JID] = true;

      return true;
    });
  }, [one]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => ACTIVE_STATUSES[job.status as Status]),
    [jobs]
  );

  const { getLoading } = useLoading();
  const loading = getLoading("project-one");

  useEffect(() => {
    loadOne(projectID ?? "");
  }, [projectID]);

  const tables = [
    hasPermission("instances:jobs:get") && activeJobs.length > 0 && (
      <JobDataTable key="jobs" values={activeJobs} loading={loading} />
    ),
    hasPermission("hashes:get") && (
      <HashDataTable
        key="hashes"
        projectID={projectID ?? ""}
        values={hashes}
        loading={loading}
      />
    ),
    hasPermission("projects:users:get") && (
      <UserDataTable
        key="users"
        projectID={projectID ?? ""}
        values={members}
        loading={loading}
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
          {one?.name ?? "Project"}
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

                    if (await remove(projectID ?? "")) navigate("/projects");
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
