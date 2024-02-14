import { createContext, useContext, useState } from "react";

import {
  AddHashRequest,
  CreateProjectRequest,
  GetProjectResponse,
  GetProjectsResponse,
  addHashToProject,
  addProjectJobs,
  addUserToProject,
  createProject,
  deleteProject,
  deleteProjectJobs,
  getProject,
  getProjects,
  removeHashFromProject,
  removeUserFromProject,
} from "@repo/api";

import { useLoader, useRequests } from "./requests";

export interface ProjectsInterface {
  readonly isLoading: boolean;

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

  readonly addJobs: (projectID: string, instanceID: string) => Promise<boolean>;
  readonly deleteJobs: (projectID: string) => Promise<boolean>;

  readonly project: GetProjectResponse["response"] | null;
  readonly loadProject: (id: string) => Promise<void>;

  readonly projects: GetProjectsResponse["response"];
  readonly loadProjects: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsInterface>({
  isLoading: true,
  project: null,
  projects: [],
  addProjects: async () => false,
  removeProjects: async () => false,
  addHashes: async () => false,
  removeHashes: async () => false,
  addUsers: async () => false,
  removeUsers: async () => false,
  addJobs: async () => false,
  deleteJobs: async () => false,
  loadProject: async () => {},
  loadProjects: async () => {},
});

export function useProjects() {
  return useContext(ProjectsContext);
}

export const ProjectsProvider = ({ children }: { children: any }) => {
  const { handleRequests } = useRequests();

  const {
    isLoading,
    one: project,
    list: projects,
    loadOne: loadProject,
    loadList: loadProjects,
    refreshOne,
    refreshList,
  } = useLoader(getProject, getProjects);

  const value: ProjectsInterface = {
    isLoading,
    project,
    loadProject,
    projects,
    loadProjects,
    addProjects: async (...reqs) => {
      const _results = await handleRequests("Project(s) added", reqs, (req) =>
        createProject(req)
      );

      await refreshList();

      return true;
    },
    removeProjects: async (...ids) => {
      const _results = await handleRequests("Project(s) removed", ids, (id) =>
        deleteProject(id)
      );

      await refreshList();

      return true;
    },
    addHashes: async (projectID, ...reqs) => {
      const _results = await handleRequests("Hash(es) added", reqs, (req) =>
        addHashToProject(projectID, req)
      );

      await refreshOne(projectID);

      return true;
    },
    removeHashes: async (projectID, ...ids) => {
      const _results = await handleRequests("Hash(es) removed", ids, (id) =>
        removeHashFromProject(projectID, id)
      );

      await refreshOne(projectID);

      return true;
    },
    addUsers: async (projectID, ...ids) => {
      const _results = await handleRequests("User(s) added", ids, (id) =>
        addUserToProject(projectID, id)
      );

      await refreshList();
      await refreshOne(projectID);

      return true;
    },
    removeUsers: async (projectID, ...ids) => {
      const _results = await handleRequests("User(s) removed", ids, (id) =>
        removeUserFromProject(projectID, id)
      );

      await refreshList();
      await refreshOne(projectID);

      return true;
    },
    addJobs: async (projectID, instanceID) => {
      const _results = await handleRequests(
        "Jobs(s) added",
        [instanceID],
        (instanceID) => addProjectJobs(projectID, instanceID)
      );

      await refreshOne(projectID);

      return true;
    },
    deleteJobs: async (projectID) => {
      const _results = await handleRequests(
        "Jobs(s) deleted",
        [projectID],
        (projectID) => deleteProjectJobs(projectID)
      );

      await refreshOne(projectID);

      return true;
    },
  };

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};
