import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CreateProjectRequest } from "@repo/api";
import { Badge } from "@repo/shadcn/components/ui/badge";
import { Input } from "@repo/shadcn/components/ui/input";
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useProjects } from "@repo/ui/projects";

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { list, loadList, add, remove } = useProjects();

  const [addProject, setAddProject] = useState<CreateProjectRequest["Body"]>({
    projectName: "",
  });

  const hasCollaborators = hasPermission("projects:users:get");

  useEffect(() => {
    loadList();
  }, []);

  return (
    <div className="p-4">
      <DataTable
        type="Project"
        values={list}
        head={["Project", hasCollaborators ? "Collaborators" : null]}
        valueKey={({ PID }) => PID}
        row={({ PID, name, members }) => [
          <TableCell
            className="cursor-pointer font-medium"
            onClick={() => navigate(`/projects/${PID}`)}
          >
            {name}
          </TableCell>,
          hasCollaborators ? (
            <TableCell
              className="cursor-pointer"
              onClick={() => navigate(`/projects/${PID}`)}
            >
              <div className="grid max-w-max grid-flow-col gap-2">
                {(members ?? []).map((member) => (
                  <Badge key={member.ID} variant="secondary">
                    {member.username}
                  </Badge>
                ))}
              </div>
            </TableCell>
          ) : null,
        ]}
        searchFilter={(project, search) =>
          project.name.toLowerCase().includes(search.toLowerCase()) ||
          (project.members ?? []).some((member) =>
            member.username.toLowerCase().includes(search.toLowerCase())
          )
        }
        addValidate={() => addProject.projectName.trim().length > 0}
        addDialog={
          <Input
            placeholder="Name"
            value={addProject.projectName}
            onChange={(e) =>
              setAddProject({ ...addProject, projectName: e.target.value })
            }
          />
        }
        noAdd={!hasPermission("projects:add")}
        onAdd={() => add(addProject)}
        noRemove
        onRemove={(projects) => remove(...projects.map(({ PID }) => PID))}
      />
    </div>
  );
};
