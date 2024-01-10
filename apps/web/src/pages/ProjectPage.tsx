import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { Header } from "@repo/ui/header";

import {
  AddHashRequest,
  GetProjectResponse,
  HASH_TYPES,
} from "../../../../packages/api/src/types.ts";
import {
  addHashToProject,
  deleteProject,
  getProject,
} from "../../../../packages/api/src/web.ts";

export const ProjectPage = () => {
  const { projectID } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [project, setProject] = useState<GetProjectResponse["response"] | null>(
    null
  );
  const [removeOpen, setRemoveOpen] = useState(false);

  const [addHash, setAddHash] = useState<AddHashRequest["Body"]>({
    hash: "",
    hashType: "",
  });

  async function refreshProject() {
    const res = await getProject(parseInt(projectID ?? "-1"));

    if (res.response) setProject(res.response);
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

  async function onAdd() {
    const res = await addHashToProject(parseInt(projectID ?? "-1"), addHash);
    return handleResponse(res);
  }

  useEffect(() => {
    refreshProject();
  }, []);

  if (project) {
    return (
      <div>
        <Header />
        <div className="grid gap-8 p-4">
          <div className="grid grid-cols-2 gap-4">
            <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
              {project.name}
            </span>
            <div className="grid justify-end gap-4">
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
                    <span>Do you want to permenantly remove the project?</span>
                    <Button>Remove</Button>
                  </form>
                </DrawerDialog>
              </div>
            </div>
          </div>
          <DataTable
            typeSingular="Hash"
            typePlural="Hashes"
            values={project.hashes}
            head={["Hash", "Type"]}
            valueKey={({ HID }) => HID}
            row={({ hash, hashType }) => [
              <TableCell>{hash}</TableCell>,
              <TableCell>{hashType}</TableCell>,
            ]}
            onRemove={async () => false}
            onAdd={onAdd}
            searchFilter={({ hash, hashType }, search) =>
              hash.toLowerCase().includes(search.toLowerCase()) ||
              hashType.toLowerCase().includes(search.toLowerCase())
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
          <Separator />
          <DataTable
            typeSingular="User"
            values={project.members}
            head={["User"]}
            valueKey={({ ID }) => ID}
            row={({ username }) => [<TableCell>{username}</TableCell>]}
            searchFilter={({ username }, search) =>
              username.toLowerCase().includes(search)
            }
          />
        </div>
      </div>
    );
  } else {
    return (
      <div>
        <Header />
      </div>
    );
  }
};
