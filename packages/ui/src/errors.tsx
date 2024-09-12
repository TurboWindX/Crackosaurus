import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { useTranslation } from "react-i18next";

import { useToast } from "@repo/shadcn/components/ui/use-toast";

import { useTRPC } from "./api";

export const useErrors = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const authQueryKey = getQueryKey(trpc.auth.get, undefined, "any");

  return {
    handleError(error: unknown) {
      if (error instanceof TRPCClientError) {
        if (error.data?.code === "UNAUTHORIZED") {
          queryClient.invalidateQueries(authQueryKey);
        }

        toast({
          variant: "destructive",
          title: t("item.error.singular"),
          description: t(`error.${error.data?.code ?? "NOT_FOUND"}`),
        });
      }
    },
  };
};
