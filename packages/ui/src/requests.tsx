import { createContext, useContext, useEffect, useState } from "react";

import { APIError, APIResponse } from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

import { useAuth } from "./auth";

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
  getID,
  loadOne,
  loadMany,
  loadList,
}: {
  getID: (record: TOne | TMany | TList) => TID;
  loadOne: (id: TID) => APIResponse<{ response: TOne }>;
  loadMany: () => APIResponse<{ response: TMany[] }>;
  loadList: () => APIResponse<{ response: TList[] }>;
}) => {
  const { invalidate, isAuthenticated } = useAuth();

  const [ID, setID] = useState<TID>("");
  const [cache, setCache] = useState<Record<string, TOne>>({});

  const [loading, setLoading] = useState(true);

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
    setLoading(true);

    const { response, error } = await loadOne(id);

    if (response) {
      setCache({
        ...cache,
        [id]: response,
      });
      setID(id);
    } else if (error.code === 401) invalidate();

    setLoading(false);

    return error === undefined;
  }

  async function refreshManyInner(): Promise<boolean> {
    setLoading(true);

    const { response, error } = await loadMany();
    if (response) {
      setMany(response);
      setManyLoaded(true);
    } else if (error.code === 401) invalidate();

    setLoading(false);

    return error === undefined;
  }

  async function refreshListInner(): Promise<boolean> {
    setLoading(true);

    const { response, error } = await loadList();
    if (response) {
      setList(response);
      setListLoaded(true);
    } else if (error.code === 401) invalidate();

    setLoading(false);

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
    loading,
    one: cache[ID] ?? null,
    loadOne: loadOneInner,
    many,
    loadMany: loadManyInner,
    list,
    loadList: loadListInner,
    refresh,
  };
};
