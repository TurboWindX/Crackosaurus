import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  AddHashRequest,
  GetProjectResponse,
  HASH_TYPES,
  addHashToProject,
  addUserToProject,
  deleteProject,
  getProject,
  removeHashFromProject,
  removeUserFromProject,
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
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { Header } from "@repo/ui/header";
import { UserSelect } from "@repo/ui/users";

interface HashDataTableProps {
  projectID: number;
  values: GetProjectResponse["response"]["hashes"];
  handleResponse: ({
    response,
    error,
  }: {
    response?: string;
    error?: string;
  }) => Promise<boolean>;
}

const HashDataTable = ({
  projectID,
  values,
  handleResponse,
}: HashDataTableProps) => {
  const { hasPermission } = useAuth();

  const [addHash, setAddHash] = useState<AddHashRequest["Body"]>({
    hash: "",
    hashType: "",
  });

  async function onAdd() {
    const res = await handleResponse(
      await addHashToProject(projectID, addHash)
    );

    if (res)
      setAddHash({
        hash: "",
        hashType: addHash.hashType,
      });

    return res;
  }

  async function onRemove(hashes: GetProjectResponse["response"]["hashes"]) {
    let res = { response: "", error: "" };
    for (let { HID } of hashes!) {
      const result = await removeHashFromProject(projectID, HID);

      if (!res.error) res = result;
    }

    return handleResponse(res);
  }

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
      onAdd={onAdd}
      noRemove={!hasPermission("projects:hashes:remove")}
      onRemove={onRemove}
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
  handleResponse: ({
    response,
    error,
  }: {
    response?: string;
    error?: string;
  }) => Promise<boolean>;
}

const UserDataTable = ({
  projectID,
  values,
  handleResponse,
}: UserDataTableProps) => {
  const { hasPermission } = useAuth();

  const [addUser, setAddUser] = useState<number | null>(null);

  async function onAdd() {
    const res = await handleResponse(
      await addUserToProject(projectID, addUser ?? -1)
    );

    if (res) setAddUser(null);

    return res;
  }

  async function onRemove(members: GetProjectResponse["response"]["members"]) {
    let res = { response: "", error: "" };
    for (let { ID } of members!) {
      const result = await removeUserFromProject(projectID, ID);

      if (!res.error) res = result;
    }

    return handleResponse(res);
  }

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
      onAdd={onAdd}
      noRemove={!hasPermission("projects:users:remove")}
      onRemove={onRemove}
    />
  );
};

export const ProjectPage = () => {
  const { projectID } = useParams();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<GetProjectResponse["response"] | null>(
    null
  );
  const [removeOpen, setRemoveOpen] = useState(false);

  async function refreshProject() {
    const res = await getProject(parseInt(projectID ?? "-1"));

    if (res.response) setProject(res.response);

    return res;
  }

  async function handleResponse({
    response,
    error,
  }: {
    response?: string;
    error?: string;
  }): Promise<boolean> {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error,
      });

      return false;
    }

    await refreshProject();

    toast({
      variant: "default",
      title: "Success",
      description: response,
    });

    return true;
  }

  useEffect(() => {
    (async () => {
      const { error } = await refreshProject();
      if (error) {
        toast({
          variant: "destructive",
          title: "Failed",
          description: error,
        });

        navigate("/projects");
      }
    })();
  }, []);

  const tables = [
    hasPermission("projects:hashes:get") && (
      <HashDataTable
        projectID={parseInt(projectID ?? "-1")}
        values={project?.hashes ?? []}
        handleResponse={handleResponse}
      />
    ),
    hasPermission("projects:users:get") && (
      <UserDataTable
        projectID={parseInt(projectID ?? "-1")}
        values={project?.members ?? []}
        handleResponse={handleResponse}
      />
    ),
  ];

  const separatedTables = tables
    .filter((value) => value)
    .flatMap((value) => [value, <Separator />]);
  separatedTables.pop();

  return (
    <div>
      <Header />
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

                      const res = await deleteProject(
                        parseInt(projectID ?? "-1")
                      );
                      await handleResponse(res);

                      if (res.response) navigate("/projects");
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
    </div>
  );
};
