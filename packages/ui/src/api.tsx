import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import { ReactNode, useState } from "react";

import type {
  AppRouter,
  AppRouterInput,
  AppRouterOutput,
} from "../../api/trpc-types";
import { AuthProvider } from "./auth";
import { UploadProvider } from "./upload";

const trpc = createTRPCReact<AppRouter>();
export type tRPCInput = AppRouterInput;
export type tRPCOutput = AppRouterOutput;

export const useTRPC = () => {
  return trpc;
};

export const APIProvider = ({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 1, // Every minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${url}/trpc`,
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: "include",
            });
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <AuthProvider>
          <UploadProvider url={url}>{children}</UploadProvider>
        </AuthProvider>
      </trpc.Provider>
    </QueryClientProvider>
  );
};
