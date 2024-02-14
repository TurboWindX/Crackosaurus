import { createContext, useContext, useEffect, useState } from "react";

import {
  CreateInstanceRequest,
  GetInstanceListResponse,
  GetInstanceResponse,
  GetInstancesResponse,
  createInstance,
  deleteInstance,
  getInstance,
  getInstanceList,
  getInstances,
} from "@repo/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

import { useLoader, useRequests } from "./requests";

export interface ClusterInterface {
  readonly isLoading: boolean;

  readonly addInstance: (
    ...reqs: CreateInstanceRequest["Body"][]
  ) => Promise<boolean>;
  readonly removeInstance: (...ids: string[]) => Promise<boolean>;

  readonly instance: GetInstanceResponse["response"] | null;
  readonly loadInstance: (id: string) => Promise<void>;

  readonly instances: GetInstancesResponse["response"];
  readonly loadInstances: () => Promise<void>;
}

const ClusterContext = createContext<ClusterInterface>({
  isLoading: true,
  instance: null,
  instances: [],
  addInstance: async () => false,
  removeInstance: async () => false,
  loadInstance: async () => {},
  loadInstances: async () => {},
});

export function useCluster() {
  return useContext(ClusterContext);
}

export const ClusterProvider = ({ children }: { children: any }) => {
  const { handleRequests } = useRequests();

  const {
    isLoading,
    one: instance,
    list: instances,
    loadOne: loadInstance,
    loadList: loadInstances,
    refresh: refreshInstances,
  } = useLoader({
    getID: ({ IID }) => IID,
    loadOne: getInstance,
    loadList: getInstances,
  });

  const value: ClusterInterface = {
    isLoading,
    instance,
    loadInstance,
    instances,
    loadInstances,
    addInstance: async (...reqs) => {
      const _results = await handleRequests("Instance(s) added", reqs, (req) =>
        createInstance(req)
      );

      await refreshInstances({
        add: [],
      });

      return true;
    },
    removeInstance: async (...ids) => {
      const results = await handleRequests("Instance(s) removed", ids, (id) =>
        deleteInstance(id)
      );

      await refreshInstances({
        remove: results.filter(([_, res]) => !res.error).map(([id]) => id),
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
        {instances
          .filter((instance) => filter?.(instance) ?? true)
          .map(({ IID, name }) => (
            <SelectItem key={IID} value={IID}>
              {name || IID}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
};
