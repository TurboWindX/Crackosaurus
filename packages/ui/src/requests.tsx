import { APIError } from "@repo/api";
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
