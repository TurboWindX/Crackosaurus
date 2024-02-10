import { createContext, useContext, useEffect, useState } from "react";

import {
  CreateInstanceRequest,
  GetInstanceListResponse,
  GetInstanceResponse,
  GetInstancesResponse,
  PROVIDERS,
  Provider,
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

const DEFAULT_ONE: GetInstanceResponse["response"] = {
  IID: "",
  provider: "debug",
  tag: "",
  status: "PENDING",
  updatedAt: new Date(),
  jobs: [],
};

export interface InstanceInterface {
  readonly isLoading: boolean;

  readonly add: (...reqs: CreateInstanceRequest["Body"][]) => Promise<boolean>;
  readonly remove: (...ids: string[]) => Promise<boolean>;

  readonly one: GetInstanceResponse["response"];
  readonly loadOne: (id: string) => Promise<void>;

  readonly list: GetInstancesResponse["response"];
  readonly loadList: () => Promise<void>;
}

const InstancesContext = createContext<InstanceInterface>({
  isLoading: true,
  one: DEFAULT_ONE,
  list: [],
  add: async () => false,
  remove: async () => false,
  loadOne: async () => {},
  loadList: async () => {},
});

export function useInstances() {
  return useContext(InstancesContext);
}

export const InstancesProvider = ({ children }: { children: any }) => {
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

  const value: InstanceInterface = {
    isLoading,
    one: cache[id] ?? DEFAULT_ONE,
    list,
    add: async (...reqs) => {
      const _results = await handleRequests("Instance(s) added", reqs, (req) =>
        createInstance(req)
      );

      await reloadList();

      return true;
    },
    remove: async (...ids) => {
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
    <InstancesContext.Provider value={value}>
      {children}
    </InstancesContext.Provider>
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

export interface ProviderSelectProps {
  value?: Provider;
  onValueChange?: (value: Provider) => void;
}

export const ProviderSelect = ({
  value,
  onValueChange,
}: ProviderSelectProps) => {
  return (
    <Select
      value={value}
      onValueChange={(value) => onValueChange?.(value as Provider)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Provider" />
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((key) => (
          <SelectItem key={key} value={key}>
            {key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
