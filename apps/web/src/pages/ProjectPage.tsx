import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AddHashRequest, GetProjectResponse, HASH_TYPES } from "@repo/api";
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
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useProjects } from "@repo/ui/projects";
import { UserSelect } from "@repo/ui/users";

interface HashDataTableProps {
  projectID: number;
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
      row={({ hash, hashType }) => [
        <TableCell>{hash}</TableCell>,
        <TableCell>{hashType}</TableCell>,
      ]}
      noAdd={!hasPermission("projects:hashes:add")}
      onAdd={() => addHashes(projectID, addHash)}
      noRemove={!hasPermission("projects:hashes:remove")}
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

interface UserDataTableProps {
  projectID: number;
  values: GetProjectResponse["response"]["members"];
}

const UserDataTable = ({ projectID, values }: UserDataTableProps) => {
  const { hasPermission } = useAuth();
  const { addUsers, removeUsers } = useProjects();

  const [addUser, setAddUser] = useState<number | null>(null);

  return (
    <DataTable
      type="User"
      values={values ?? []}
      head={["User"]}
      valueKey={({ ID }) => ID}
      row={({ username }) => [<TableCell>{username}</TableCell>]}
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
      onAdd={() => addUsers(projectID, addUser ?? -1)}
      noRemove={!hasPermission("projects:users:remove")}
      onRemove={(users) => removeUsers(projectID, ...users.map(({ ID }) => ID))}
    />
  );
};

export const ProjectPage = () => {
  const { projectID } = useParams();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const { one, loadOne, remove } = useProjects();
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    loadOne(parseInt(projectID ?? "-1"));
  }, []);

  const tables = [
    hasPermission("projects:hashes:get") && (
      <HashDataTable
        key="hashes"
        projectID={parseInt(projectID ?? "-1")}
        values={one?.hashes ?? []}
      />
    ),
    hasPermission("projects:users:get") && (
      <UserDataTable
        key="users"
        projectID={parseInt(projectID ?? "-1")}
        values={one?.members ?? []}
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
          {one.name}
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

                    if (await remove(parseInt(projectID ?? "-1")))
                      navigate("/projects");
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
