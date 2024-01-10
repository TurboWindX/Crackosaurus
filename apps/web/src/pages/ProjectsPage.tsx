import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  CreateProjectRequest,
  GetProjectsResponse,
  createProject,
  deleteProject,
  getProjects,
} from "@repo/api";
import { Badge } from "@repo/shadcn/components/ui/badge";
import { Input } from "@repo/shadcn/components/ui/input";
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { DataTable } from "@repo/ui/data";
import { Header } from "@repo/ui/header";

export interface ProjectStatusBadgeProps {
  status: "complete" | "crack" | "open";
}

export const ProjectStatusBadge = ({ status }: ProjectStatusBadgeProps) => {
  switch (status) {
    case "complete":
      return (
        <Badge
          style={{
            backgroundColor: "green",
            color: "white",
          }}
        >
          Complete
        </Badge>
      );
    case "crack":
      return (
        <Badge
          style={{
            backgroundColor: "yellow",
          }}
        >
          Cracking
        </Badge>
      );
    case "open":
      return (
        <Badge
          style={{
            backgroundColor: "blue",
            color: "white",
          }}
        >
          Open
        </Badge>
      );
  }
};

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [projects, setProjects] = useState<GetProjectsResponse["response"]>([]);
  const [addProject, setAddProject] = useState<CreateProjectRequest["Body"]>({
    projectName: "",
  });

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

    await refreshProjects();

    toast({
      variant: "default",
      title: "Success",
      description: response,
    });

    return true;
  }

  async function onAdd() {
    return await handleResponse(await createProject(addProject));
  }

  async function onRemove(projects: GetProjectsResponse["response"]) {
    let res = { response: "", error: "" };
    for (let project of projects) {
      const result = await deleteProject(project.PID);

      if (!res.error) res = result;
    }

    return await handleResponse(res);
  }

  async function refreshProjects() {
    const res = await getProjects();

    if (res.response) setProjects(res.response);
  }

  useEffect(() => {
    refreshProjects();
  }, []);

  return (
    <div>
      <Header />
      <div className="p-4">
        <DataTable
          typeSingular="Project"
          values={projects}
          head={["Project", "Collaborators"]}
          valueKey={({ PID }) => PID}
          row={({ PID, name, members }) => [
            <TableCell
              className="cursor-pointer font-medium"
              onClick={() => navigate(`/projects/${PID}`)}
            >
              {name}
            </TableCell>,
            <TableCell
              className="cursor-pointer"
              onClick={() => navigate(`/projects/${PID}`)}
            >
              <div className="grid max-w-max grid-flow-col gap-2">
                {members.map((member) => (
                  <Badge key={member.ID} variant="secondary">
                    {member.username}
                  </Badge>
                ))}
              </div>
            </TableCell>,
          ]}
          searchFilter={(project, search) =>
            project.name.toLowerCase().includes(search.toLowerCase()) ||
            project.members.some((member) =>
              member.username.toLowerCase().includes(search.toLowerCase())
            )
          }
          addDialog={
            <Input
              placeholder="Name"
              value={addProject.projectName}
              onChange={(e) =>
                setAddProject({ ...addProject, projectName: e.target.value })
              }
            />
          }
          onAdd={onAdd}
          noRemove
          onRemove={onRemove}
        />
      </div>
    </div>
  );
};
