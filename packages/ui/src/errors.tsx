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

        // For a BAD_REQUEST carrying a custom server message (e.g. "Password
        // must be at least 15 characters"), show that message verbatim instead
        // of the generic "Invalid input" code translation — otherwise the real
        // reason is hidden. Skip it for zod input rejections (data.zodError set)
        // and for bare throws where the message is just the code name, both of
        // which stay on the generic translation.
        const code = error.data?.code ?? "NOT_FOUND";
        const hasZodError = Boolean(
          (error.data as { zodError?: unknown } | undefined)?.zodError
        );
        const serverMessage = error.message;
        const showServerMessage =
          code === "BAD_REQUEST" &&
          !hasZodError &&
          Boolean(serverMessage) &&
          serverMessage !== code;

        toast({
          variant: "destructive",
          title: t("item.error.singular"),
          description: showServerMessage
            ? serverMessage
            : t(`error.${code}`),
        });
      }
    },
  };
};
