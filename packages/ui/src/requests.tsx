import { createContext, useContext, useEffect, useState } from "react";

import { APIError, APIResponse } from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

import { useAuth } from "./auth";

export interface LoadingInterface {
  readonly setLoading: (key: string, value: boolean) => void;
  readonly getLoading: (key: string) => boolean;
}

const LoadingContext = createContext<LoadingInterface>({
  setLoading: () => {},
  getLoading: () => true,
});

export function useLoading() {
  return useContext(LoadingContext);
}

export const LoadingProvider = ({ children }: { children: any }) => {
  const [state, setState] = useState<Record<string, boolean>>({});

  const value: LoadingInterface = {
    setLoading: (key, value) => {
      console.log(key, value);

      setState({
        ...state,
        [key]: value,
      });
    },
    getLoading: (key) => state[key] ?? true,
  };

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
};

export const useRequests = () => {
  const { toast } = useToast();
  const { invalidate } = useAuth();

  function handleSuccess(message: string) {
    toast({
      variant: "default",
      title: "Success",
      description: message,
    });
  }

  function handleErrors(results: (readonly [any, APIError])[]): boolean {
    const errors = results
      .map(([_, { error }]) => error)
      .filter((error) => error != null);

    if (errors.length === 0) return true;

    if (errors.some((error) => error.code === 401)) invalidate();

    toast({
      variant: "destructive",
      title: "Error",
      description: errors.map((error) => error.message).join(", "),
    });

    return false;
  }

  async function handleRequests<T, R extends APIError>(
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

  return {
    handleRequests,
  };
};

type TID = string;

export const useLoader = <TOne, TMany, TList>({
  key,
  getID,
  loadOne,
  loadMany,
  loadList,
}: {
  key: string;
  getID: (record: TOne | TMany | TList) => TID;
  loadOne: (id: TID) => APIResponse<{ response: TOne }>;
  loadMany: () => APIResponse<{ response: TMany[] }>;
  loadList: () => APIResponse<{ response: TList[] }>;
}) => {
  const { setLoading } = useLoading();
  const { invalidate, isAuthenticated } = useAuth();

  const [ID, setID] = useState<TID>("");
  const [cache, setCache] = useState<Record<string, TOne>>({});

  const [many, setMany] = useState<TMany[]>([]);
  const [manyLoaded, setManyLoaded] = useState(false);

  const [list, setList] = useState<TList[]>([]);
  const [listLoaded, setListLoaded] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return;

    setCache({});

    setMany([]);
    setManyLoaded(false);

    setList([]);
    setListLoaded(false);
  }, [isAuthenticated]);

  async function loadOneInner(id: TID) {
    if (!cache[id]) await refreshOneInner(id);
  }

  async function loadManyInner() {
    if (!manyLoaded) await refreshManyInner();
  }

  async function loadListInner() {
    if (!listLoaded) await refreshListInner();
  }

  async function refreshOneInner(id: TID): Promise<boolean> {
    setLoading(`${key}-one`, true);

    const { response, error } = await loadOne(id);

    if (response) {
      setCache({
        ...cache,
        [id]: response,
      });
      setID(id);
    } else if (error.code === 401) invalidate();

    setLoading(`${key}-one`, false);

    return error === undefined;
  }

  async function refreshManyInner(): Promise<boolean> {
    setLoading(`${key}-many`, true);

    const { response, error } = await loadMany();
    if (response) {
      setMany(response);
      setManyLoaded(true);
    } else if (error.code === 401) invalidate();

    setLoading(`${key}-many`, false);

    return error === undefined;
  }

  async function refreshListInner(): Promise<boolean> {
    setLoading(`${key}-list`, true);

    const { response, error } = await loadList();
    if (response) {
      setList(response);
      setListLoaded(true);
    } else if (error.code === 401) invalidate();

    setLoading(`${key}-list`, false);

    return error === undefined;
  }

  async function refresh({
    add,
    update,
    remove,
  }: {
    add?: TID[];
    update?: TID[];
    remove?: TID[];
  }) {
    if (add !== undefined) {
      if (manyLoaded) await refreshManyInner();
      if (listLoaded) await refreshListInner();
    }

    if (update !== undefined && update.length > 0) {
      if (ID && update.some((oID) => ID === oID)) await refreshOneInner(ID);

      if (manyLoaded) await refreshManyInner();
    }

    if (remove !== undefined && remove.length > 0) {
      if (ID && remove.some((oID) => ID === oID)) setID("");

      setMany(
        many.filter((entry) => remove.every((ID) => ID !== getID(entry)))
      );

      setList(
        list.filter((entry) => remove.every((ID) => ID !== getID(entry)))
      );
    }
  }

  return {
    one: cache[ID] ?? null,
    loadOne: loadOneInner,
    many,
    loadMany: loadManyInner,
    list,
    loadList: loadListInner,
    refresh,
  };
};
