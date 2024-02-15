import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CreateProjectRequest } from "@repo/api";
import { Badge } from "@repo/shadcn/components/ui/badge";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useProjects } from "@repo/ui/projects";
import { RelativeTime } from "@repo/ui/time";

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { projects, loadProjects, addProjects, removeProjects } = useProjects();

  const [addProject, setAddProject] = useState<CreateProjectRequest["Body"]>({
    projectName: "",
  });

  const hasCollaborators = hasPermission("projects:users:get");

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div className="p-4">
      <DataTable
        type="Project"
        values={projects}
        head={[
          "Project",
          hasCollaborators ? "Collaborators" : null,
          "Last Updated",
        ]}
        valueKey={({ PID }) => PID}
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        rowClick={({ PID }) => navigate(`/projects/${PID}`)}
        row={({ name, members, updatedAt }) => [
          name,
          hasCollaborators ? (
            <div className="grid max-w-max grid-flow-col gap-2">
              {(members ?? []).map((member) => (
                <Badge key={member.ID} variant="secondary">
                  {member.username}
                </Badge>
              ))}
            </div>
          ) : null,
          <RelativeTime time={updatedAt} />,
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
        onAdd={() => addProjects(addProject)}
        noRemove
        onRemove={(projects) =>
          removeProjects(...projects.map(({ PID }) => PID))
        }
      />
    </div>
  );
};
