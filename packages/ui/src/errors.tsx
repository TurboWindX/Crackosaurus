import { useQueryClient } from "@tanstack/react-query";

import { APIError } from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

export const useErrors = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return {
    handleError(error: Error) {
      if (error instanceof APIError) {
        if (error.status === 401) {
          queryClient.invalidateQueries({
            queryKey: ["auth"],
          });

          return false;
        }

        toast({
          variant: "destructive",
          title: "Error",
          description: error.message,
        });
      }

      return false;
    },
  };
};
