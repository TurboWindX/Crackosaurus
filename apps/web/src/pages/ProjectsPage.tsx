import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { APIError } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { type REQ } from "@repo/api/server/client/web";
import { Badge } from "@repo/shadcn/components/ui/badge";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { RelativeTime } from "@repo/ui/time";

export const ProjectsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [newProject, setNewProject] = useState<REQ<APIType["createProject"]>>({
    projectName: "",
  });

  const hasCollaborators = hasPermission("projects:users:get");

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const {
    data: projects,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["projects", "list", "page"],
    queryFn: API.getProjects,
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: createProject } = useMutation({
    mutationFn: API.createProject,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", "list"],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: deleteProjects } = useMutation({
    mutationFn: (projectIDs: string[]) => API.deleteProjects({ projectIDs }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["projects", "list"],
      });
    },
    onError: handleError,
  });

  return (
    <div className="p-4">
      <DataTable
        singular={t("item.project.singular")}
        plural={t("item.project.plural")}
        values={projects ?? []}
        head={[
          t("item.project.singular"),
          hasCollaborators ? t("item.collaborator.plural") : null,
          t("item.time.update"),
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
                <Badge key={member.ID}>{member.username}</Badge>
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
            placeholder={t("item.name.singular")}
            value={newProject.projectName}
            onChange={(e) =>
              setNewProject({ ...newProject, projectName: e.target.value })
            }
          />
        }
        noAdd={!hasPermission("projects:add")}
        onAdd={async () => {
          await createProject(newProject);

          setNewProject({ ...newProject, projectName: "" });

          return true;
        }}
        noRemove={!hasPermission("root")}
        onRemove={async (projects) => {
          await deleteProjects(projects.map((project) => project.PID));

          return true;
        }}
      />
    </div>
  );
};
