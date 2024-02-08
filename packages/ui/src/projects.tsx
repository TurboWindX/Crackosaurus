import { createContext, useContext, useState } from "react";

import {
  AddHashRequest,
  ApiError,
  CreateProjectJobsRequest,
  CreateProjectRequest,
  GetProjectResponse,
  GetProjectsResponse,
  addHashToProject,
  addProjectJobs,
  addUserToProject,
  createProject,
  deleteProject,
  getProject,
  getProjects,
  removeHashFromProject,
  removeUserFromProject,
} from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

export interface ProjectsInterface {
  readonly isLoading: boolean;

  readonly add: (...reqs: CreateProjectRequest["Body"][]) => Promise<boolean>;
  readonly remove: (...ids: string[]) => Promise<boolean>;

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

  readonly addJobs: (projectID: string, provider: string, instanceType?: string) => Promise<boolean>;

  readonly one: GetProjectResponse["response"];
  readonly loadOne: (id: string) => Promise<void>;

  readonly list: GetProjectsResponse["response"];
  readonly loadList: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsInterface>({
  isLoading: true,
  add: async () => false,
  remove: async () => false,
  addHashes: async () => false,
  removeHashes: async () => false,
  addUsers: async () => false,
  removeUsers: async () => false,
  addJobs: async() => false,
  one: {
    PID: "",
    name: "Project",
  },
  loadOne: async () => {},
  list: [],
  loadList: async () => {},
});

export function useProjects() {
  return useContext(ProjectsContext);
}

export const ProjectsProvider = ({ children }: { children: any }) => {
  const { toast } = useToast();
  const [isLoading, setLoading] = useState(false);
  const [id, setID] = useState<string>("");
  const [cache, setCache] = useState<
    Record<string, GetProjectResponse["response"]>
  >({});
  const [list, setList] = useState<GetProjectsResponse["response"]>([]);
  const [listLoaded, setListLoaded] = useState(false);

  async function reloadOne(id: string): Promise<boolean> {
    setLoading(true);
    const { response, error } = await getProject(id);
    if (error) return false;

    setCache({
      ...cache,
      [id]: response,
    });
    setID(id);
    setLoading(false);

    return true;
  }

  async function reloadList() {
    setLoading(true);
    setListLoaded(true);

    const { response, error } = await getProjects();
    if (!error) setList(response);

    setLoading(false);
  }

  async function handleRequests<T, R extends ApiError>(
    message: string,
    values: T[],
    callback: (value: T) => Promise<R>
  ): Promise<(readonly [T, R])[]> {
    const results = await Promise.all(
      values.map(async (value) => [value, await callback(value)] as const)
    );
    if (!handleErrors(results)) return results;

    handleSuccess(message);

    return results;
  }

  function handleSuccess(message: string) {
    toast({
      variant: "default",
      title: "Success",
      description: message,
    });
  }

  function handleErrors(results: (readonly [any, ApiError])[]): boolean {
    const errors = results
      .map(([_, { error }]) => error)
      .filter((error) => error != null);

    if (errors.length === 0) return true;

    toast({
      variant: "destructive",
      title: "Error",
      description: errors.join(", "),
    });

    return false;
  }

  const value: ProjectsInterface = {
    isLoading,
    one: cache[id] ?? {
      PID: "",
      name: "Project",
    },
    list,
    add: async (...reqs) => {
      const _results = await handleRequests("Project(s) added", reqs, (req) =>
        createProject(req)
      );

      await reloadList();

      return true;
    },
    remove: async (...ids) => {
      const results = await handleRequests("Project(s) removed", ids, (id) =>
        deleteProject(id)
      );

      setList(
        list.filter(({ PID }) =>
          results.every(([id, { error }]) => PID !== id || error)
        )
      );

      return true;
    },
    addHashes: async (projectID, ...reqs) => {
      const _results = await handleRequests("Hash(es) added", reqs, (req) =>
        addHashToProject(projectID, req)
      );

      await reloadOne(projectID);

      return true;
    },
    removeHashes: async (projectID, ...ids) => {
      const results = await handleRequests("Hash(es) removed", ids, (id) =>
        removeHashFromProject(projectID, id)
      );

      const project = cache[projectID]!;
      setCache({
        ...cache,
        [projectID]: {
          ...project,
          hashes: project.hashes?.filter(({ HID }) =>
            results.every(([id, { error }]) => HID !== id || error)
          ),
        },
      });

      return true;
    },
    addUsers: async (projectID, ...ids) => {
      const _results = await handleRequests("User(s) added", ids, (id) =>
        addUserToProject(projectID, id)
      );

      await reloadList();
      await reloadOne(projectID);

      return true;
    },
    removeUsers: async (projectID, ...ids) => {
      const results = await handleRequests("User(s) removed", ids, (id) =>
        removeUserFromProject(projectID, id)
      );

      setList(list.map((project) => project.PID === projectID ? {
        ...project,
        members: project.members?.filter(({ ID }) => 
          results.every(([id, { error }]) => ID !== id || error)
        )
      } : project));

      const project = cache[projectID]!;
      setCache({
        ...cache,
        [projectID]: {
          ...project,
          members: project.members?.filter(({ ID }) =>
            results.every(([id, { error }]) => ID !== id || error)
          ),
        },
      });

      return true;
    },
    addJobs: async (projectID, provider, instanceType) => { 
      const _results = await handleRequests("Jobs(s) added", [{ provider, instanceType }], ({ provider, instanceType }) =>
        addProjectJobs(projectID, provider, instanceType)
      );

      await reloadOne(projectID);

      return true;
    },
    loadOne: async (id: string) => {
      setLoading(true);

      if (cache[id] || (await reloadOne(id))) setID(id);

      setLoading(false);
    },
    loadList: async () => {
      setLoading(true);

      if (!listLoaded) await reloadList();
      setListLoaded(true);

      setLoading(false);
    },
  };

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};
