import { createContext, useContext } from "react";

import {
  AddHashRequest,
  CreateProjectRequest,
  GetProjectListResponse,
  GetProjectResponse,
  GetProjectsResponse,
  addHashToProject,
  addUserToProject,
  createProject,
  deleteProject,
  getProject,
  getProjectList,
  getProjects,
  removeHashFromProject,
  removeUserFromProject,
} from "@repo/api";

import { useLoader, useRequests } from "./requests";

export interface ProjectsInterface {
  readonly loading: boolean;

  readonly addProjects: (
    ...reqs: CreateProjectRequest["Body"][]
  ) => Promise<boolean>;
  readonly removeProjects: (...ids: string[]) => Promise<boolean>;

  readonly addHashes: (
    projectID: string,
    ...reqs: AddHashRequest["Body"][]
  ) => Promise<boolean>;
  readonly removeHashes: (
    projectID: string,
    ...ids: string[]
  ) => Promise<boolean>;

  readonly addUsers: (projectID: string, ...ids: string[]) => Promise<boolean>;
  readonly removeUsers: (
    projectID: string,
    ...ids: string[]
  ) => Promise<boolean>;

  readonly project: GetProjectResponse["response"] | null;
  readonly loadProject: (id: string) => Promise<void>;

  readonly projects: GetProjectsResponse["response"];
  readonly loadProjects: () => Promise<void>;

  readonly projectList: GetProjectListResponse["response"];
  readonly loadProjectList: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsInterface>({
  loading: true,
  project: null,
  projects: [],
  projectList: [],
  addProjects: async () => false,
  removeProjects: async () => false,
  addHashes: async () => false,
  removeHashes: async () => false,
  addUsers: async () => false,
  removeUsers: async () => false,
  loadProject: async () => {},
  loadProjects: async () => {},
  loadProjectList: async () => {},
});

export function useProjects() {
  return useContext(ProjectsContext);
}

export const ProjectsProvider = ({ children }: { children: any }) => {
  const { handleRequests } = useRequests();

  const {
    loading,
    one: project,
    many: projects,
    list: projectList,
    loadOne: loadProject,
    loadMany: loadProjects,
    loadList: loadProjectList,
    refresh: refreshProjects,
  } = useLoader({
    getID: ({ PID }) => PID,
    loadOne: getProject,
    loadMany: getProjects,
    loadList: getProjectList,
  });

  const value: ProjectsInterface = {
    loading,
    project,
    loadProject,
    projects,
    loadProjects,
    projectList,
    loadProjectList,
    addProjects: async (...reqs) => {
      const _results = await handleRequests("Project(s) added", reqs, (req) =>
        createProject(req)
      );

      await refreshProjects({
        add: [],
      });

      return true;
    },
    removeProjects: async (...ids) => {
      const results = await handleRequests("Project(s) removed", ids, (id) =>
        deleteProject(id)
      );

      await refreshProjects({
        remove: results.filter(([_, res]) => !res.error).map(([id]) => id),
      });

      return true;
    },
    addHashes: async (projectID, ...reqs) => {
      const results = await handleRequests("Hash(es) added", reqs, (req) =>
        addHashToProject(projectID, req)
      );

      await refreshProjects({
        update: results.some(([_, res]) => !res.error)
          ? [projectID]
          : undefined,
      });

      return true;
    },
    removeHashes: async (projectID, ...ids) => {
      const results = await handleRequests("Hash(es) removed", ids, (id) =>
        removeHashFromProject(projectID, id)
      );

      await refreshProjects({
        update: results.some(([_, res]) => !res.error)
          ? [projectID]
          : undefined,
      });

      return true;
    },
    addUsers: async (projectID, ...ids) => {
      const results = await handleRequests("User(s) added", ids, (id) =>
        addUserToProject(projectID, id)
      );

      await refreshProjects({
        update: results.some(([_, res]) => !res.error)
          ? [projectID]
          : undefined,
      });

      return true;
    },
    removeUsers: async (projectID, ...ids) => {
      const results = await handleRequests("User(s) removed", ids, (id) =>
        removeUserFromProject(projectID, id)
      );

      await refreshProjects({
        update: results.some(([_, res]) => !res.error)
          ? [projectID]
          : undefined,
      });

      return true;
    },
  };

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};
