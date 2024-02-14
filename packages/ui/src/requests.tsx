import { useState } from "react";

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

export const useLoader = <
  TOne extends { response: any },
  TList extends { response: any[] },
>(
  loadOne: (id: string) => APIResponse<TOne>,
  loadList: () => APIResponse<TList>
) => {
  const { invalidate } = useAuth();

  const [isLoading, setLoading] = useState(false);

  const [one, setOne] = useState<TOne["response"] | null>(null);
  const [list, setList] = useState<TList["response"]>([]);

  async function loadOneInner(id: string) {
    setLoading(true);

    const { response, error } = await loadOne(id);
    if (response) setOne(response);
    else if (error.code === 401) invalidate();

    setLoading(false);
  }

  async function loadListInner() {
    setLoading(true);

    const { response, error } = await loadList();
    if (response) setList(response);
    else if (error.code === 401) invalidate();

    setLoading(false);
  }

  async function refreshOne(id: string) {
    await loadOneInner(id);
  }

  async function refreshList() {
    await loadListInner();
  }

  return {
    isLoading,
    one,
    list,
    loadOne: loadOneInner,
    loadList: loadListInner,
    refreshOne,
    refreshList,
  };
};
