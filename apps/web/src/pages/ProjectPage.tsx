import { PlayIcon, SquareIcon, TrashIcon } from "lucide-react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { InstanceSelect } from "@repo/ui/instances";
import { useProjects } from "@repo/ui/projects";
import { StatusBadge } from "@repo/ui/status";
import { RelativeTime } from "@repo/ui/time";
import { UserSelect } from "@repo/ui/users";

interface HashDataTableProps {
  projectID: string;
  values: GetProjectResponse["response"]["hashes"];
}

const HashDataTable = ({ projectID, values }: HashDataTableProps) => {
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
      head={["Hash", "Type"]}
      valueKey={({ HID }) => HID}
      row={({ hash, hashType }) => [hash, hashType]}
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
              {HASH_TYPES.map((type) => (
                <SelectItem value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    />
  );
};

interface JobDataTableProps {
  values: GetProjectJob[];
}

const JobDataTable = ({ values }: JobDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Job"
      values={values ?? []}
      head={["Job", "Instance", "Status", "Last Updated"]}
      valueKey={({ JID }) => JID}
      rowClick={({ instance }) => navigate(`/instances/${instance.IID}`)}
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
}

const UserDataTable = ({ projectID, values }: UserDataTableProps) => {
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
      searchFilter={({ username }, search) =>
        username.toLowerCase().includes(search)
      }
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

  const { one, loadOne, remove, addJobs, deleteJobs } = useProjects();

  const [startOpen, setStartOpen] = useState(false);
  const [startInstanceID, setStartInstanceID] = useState("");

  const [stopOpen, setStopOpen] = useState(false);

  const [removeOpen, setRemoveOpen] = useState(false);

  const hashes = useMemo(() => one?.hashes ?? [], [one]);

  const members = useMemo(() => one?.members ?? [], [one]);

  const jobs = useMemo(() => {
    const unfilteredJobs = (one?.hashes ?? [])
      .map((hash) => hash.job)
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

  useEffect(() => {
    loadOne(projectID ?? "");
  }, []);

  const tables = [
    hasPermission("jobs:get") && activeJobs.length > 0 && (
      <JobDataTable key="jobs" values={activeJobs} />
    ),
    hasPermission("hashes:get") && (
      <HashDataTable key="hashes" projectID={projectID ?? ""} values={hashes} />
    ),
    hasPermission("projects:users:get") && (
      <UserDataTable key="users" projectID={projectID ?? ""} values={members} />
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
          {one.name}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {hasPermission("jobs:add") && (
            <div className="w-max">
              <DrawerDialog
                title="Start Cracking"
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

                    await addJobs(projectID as string, startInstanceID);

                    setStartOpen(false);
                  }}
                >
                  <InstanceSelect
                    value={startInstanceID}
                    onValueChange={setStartInstanceID}
                  />
                  <Button disabled={startInstanceID.length === 0}>Start</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
          {hasPermission("jobs:remove") && (
            <div className="w-max">
              <DrawerDialog
                title="Stop Cracking"
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

                    if (await deleteJobs(projectID ?? "")) setStopOpen(false);
                  }}
                >
                  <span>Do you want to stop cracking?</span>
                  <Button>Stop</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
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
