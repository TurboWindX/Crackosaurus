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

import { useAuth } from "./auth";
import { useRequests } from "./requests";

const DEFAULT_ONE_INSTANCE: GetInstanceResponse["response"] = {
  IID: "",
  tag: "",
  status: "PENDING",
  updatedAt: new Date(),
  jobs: [],
};

export interface ClusterInterface {
  readonly isLoading: boolean;

  readonly addInstance: (
    ...reqs: CreateInstanceRequest["Body"][]
  ) => Promise<boolean>;
  readonly removeInstance: (...ids: string[]) => Promise<boolean>;

  readonly oneInstance: GetInstanceResponse["response"];
  readonly loadOneInstance: (id: string) => Promise<void>;

  readonly listInstances: GetInstancesResponse["response"];
  readonly loadListInstances: () => Promise<void>;
}

const ClusterContext = createContext<ClusterInterface>({
  isLoading: true,
  oneInstance: DEFAULT_ONE_INSTANCE,
  listInstances: [],
  addInstance: async () => false,
  removeInstance: async () => false,
  loadOneInstance: async () => {},
  loadListInstances: async () => {},
});

export function useCluster() {
  return useContext(ClusterContext);
}

export const ClusterProvider = ({ children }: { children: any }) => {
  const { invalidate } = useAuth();
  const { handleRequests } = useRequests();

  const [isLoading, setLoading] = useState(false);
  const [cache, setCache] = useState<
    Record<string, GetInstanceResponse["response"]>
  >({});

  const [id, setID] = useState<string>("");
  const [list, setList] = useState<GetInstancesResponse["response"]>([]);
  const [listLoaded, setListLoaded] = useState(false);

  async function reloadOne(id: string): Promise<boolean> {
    setLoading(true);

    const { response, error } = await getInstance(id);
    if (response) {
      setCache({
        ...cache,
        [id]: response,
      });
      setID(id);
    } else if (error.code === 401) invalidate();

    setLoading(false);

    return response !== undefined;
  }

  async function reloadList() {
    setLoading(true);

    const { response, error } = await getInstances();
    if (response) setList(response);
    else if (error.code === 401) invalidate();

    setLoading(false);
  }

  const value: ClusterInterface = {
    isLoading,
    oneInstance: cache[id] ?? DEFAULT_ONE_INSTANCE,
    listInstances: list,
    addInstance: async (...reqs) => {
      const _results = await handleRequests("Instance(s) added", reqs, (req) =>
        createInstance(req)
      );

      await reloadList();

      return true;
    },
    removeInstance: async (...ids) => {
      const results = await handleRequests("Instance(s) removed", ids, (id) =>
        deleteInstance(id)
      );

      setList(
        list.filter(({ IID }) =>
          results.every(([id, { error }]) => IID !== id || error)
        )
      );

      return true;
    },
    loadOneInstance: async (id: string) => {
      setLoading(true);

      if (cache[id] || (await reloadOne(id))) setID(id);

      setLoading(false);
    },
    loadListInstances: async () => {
      setLoading(true);

      if (!listLoaded) await reloadList();
      setListLoaded(true);

      setLoading(false);
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
