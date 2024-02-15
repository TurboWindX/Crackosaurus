import { createContext, useContext, useEffect, useState } from "react";

import {
  CreateInstanceJobRequest,
  CreateInstanceRequest,
  GetInstanceListResponse,
  GetInstanceResponse,
  GetInstancesResponse,
  createInstance,
  createInstanceJob,
  deleteInstance,
  deleteInstanceJob,
  getInstance,
  getInstanceList,
  getInstances,
} from "@repo/api";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

import { useLoader, useRequests } from "./requests";

export interface ClusterInterface {
  readonly addInstances: (
    ...reqs: CreateInstanceRequest["Body"][]
  ) => Promise<boolean>;
  readonly removeInstances: (...ids: string[]) => Promise<boolean>;

  readonly addJobs: (
    instanceID: string,
    ...req: CreateInstanceJobRequest["Body"][]
  ) => Promise<boolean>;
  readonly removeJobs: (
    instanceID: string,
    ...ids: string[]
  ) => Promise<boolean>;

  readonly instance: GetInstanceResponse["response"] | null;
  readonly loadInstance: (id: string) => Promise<void>;

  readonly instances: GetInstancesResponse["response"];
  readonly loadInstances: () => Promise<void>;
}

const ClusterContext = createContext<ClusterInterface>({
  instance: null,
  instances: [],
  addInstances: async () => false,
  removeInstances: async () => false,
  addJobs: async () => false,
  removeJobs: async () => false,
  loadInstance: async () => {},
  loadInstances: async () => {},
});

export function useCluster() {
  return useContext(ClusterContext);
}

export const ClusterProvider = ({ children }: { children: any }) => {
  const { handleRequests } = useRequests();

  const {
    one: instance,
    many: instances,
    loadOne: loadInstance,
    loadMany: loadInstances,
    refresh: refreshInstances,
  } = useLoader({
    key: "instance",
    getID: ({ IID }) => IID,
    loadOne: getInstance,
    loadMany: getInstances,
    loadList: getInstanceList,
  });

  const value: ClusterInterface = {
    instance,
    loadInstance,
    instances,
    loadInstances,
    addInstances: async (...reqs) => {
      const _results = await handleRequests("Instance(s) added", reqs, (req) =>
        createInstance(req)
      );

      await refreshInstances({
        add: [],
      });

      return true;
    },
    removeInstances: async (...ids) => {
      const results = await handleRequests("Instance(s) removed", ids, (id) =>
        deleteInstance(id)
      );

      await refreshInstances({
        remove: results.filter(([_, res]) => !res.error).map(([id]) => id),
      });

      return true;
    },
    addJobs: async (instanceID, ...reqs) => {
      const _results = await handleRequests("Job(s) added", reqs, (req) =>
        createInstanceJob(instanceID, req)
      );

      await refreshInstances({
        update: [instanceID],
      });

      return true;
    },
    removeJobs: async (instanceID, ...ids) => {
      const _results = await handleRequests("Job(s) added", ids, (id) =>
        deleteInstanceJob(instanceID, id)
      );

      await refreshInstances({
        update: [instanceID],
      });

      return true;
    },
  };

  return (
    <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
  );
};

export interface InstanceSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
  filter?: (user: GetInstanceListResponse["response"][number]) => boolean;
}

export const InstanceSelect = ({
  value,
  onValueChange,
  filter,
}: InstanceSelectProps) => {
  const [instances, setInstances] = useState<
    GetInstanceListResponse["response"]
  >([]);

  async function refreshInstances() {
    const { response } = await getInstanceList();

    if (response) setInstances(response);
  }

  useEffect(() => {
    refreshInstances();
  }, []);

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Instance" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Instance</SelectLabel>
          {instances
            .filter((instance) => filter?.(instance) ?? true)
            .map(({ IID, name }) => (
              <SelectItem key={IID} value={IID}>
                {name || IID}
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
