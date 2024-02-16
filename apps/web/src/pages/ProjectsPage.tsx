import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { type APIType } from "@repo/api/server";
import { type REQ } from "@repo/api/server/client/web";
import { Badge } from "@repo/shadcn/components/ui/badge";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { RelativeTime } from "@repo/ui/time";

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [newProject, setNewProject] = useState<REQ<APIType["createProject"]>>({
    projectName: "",
  });

  const hasCollaborators = hasPermission("projects:users:get");

  const API = useAPI();
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", "list", "page"],
    queryFn: API.getProjects,
  });

  const { mutateAsync: createProject } = useMutation({
    mutationFn: API.createProject,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", "list"],
      });
    },
  });

  return (
    <div className="p-4">
      <DataTable
        type="Project"
        values={projects ?? []}
        head={[
          "Project",
          hasCollaborators ? "Collaborators" : null,
          "Last Updated",
        ]}
        valueKey={({ PID }) => PID}
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        isLoading={isLoading}
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
        addValidate={() => newProject.projectName.trim().length > 0}
        addDialog={
          <Input
            placeholder="Name"
            value={newProject.projectName}
            onChange={(e) =>
              setNewProject({ ...newProject, projectName: e.target.value })
            }
          />
        }
        noAdd={!hasPermission("projects:add")}
        onAdd={async () => {
          await createProject(newProject);
          return true;
        }}
      />
    </div>
  );
};
