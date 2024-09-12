import { TRPCClientError } from "@trpc/client";
import { ReactNode, useContext, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { PermissionType, hasPermission } from "@repo/api";

import { useTRPC } from "./api";
import { AuthContext, AuthInterface } from "./contexts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();

  const { data, isLoading, isLoadingError, isError } = trpc.auth.get.useQuery(
    undefined,
    {
      retry(count, error) {
        if (
          error instanceof TRPCClientError &&
          error.data?.code === "UNAUTHORIZED"
        )
          return false;
        return count < 3;
      },
      onError() {},
    }
  );

  const uid = useMemo(() => data?.uid ?? "", [data]);
  const username = useMemo(() => data?.username ?? "username", [data]);
  const isAuthenticated = useMemo(
    () => !isLoadingError && !isError && data?.uid !== undefined,
    [isError, isLoadingError, data]
  );
  const userHasPermission = useMemo(
    () => (permission: PermissionType) =>
      hasPermission(data?.permissions ?? "", permission),
    [data]
  );

  const value: AuthInterface = {
    isLoading,
    uid,
    username,
    isAuthenticated,
    hasPermission: userHasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function PermissionRoute({
  permission,
  children,
}: {
  permission: PermissionType;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, hasPermission } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) navigate("/login");
      else if (!hasPermission(permission)) navigate("/");
    }
  }, [isLoading, isAuthenticated, hasPermission]);

  if (isLoading || !isAuthenticated) return <></>;

  return children;
}

export function AuthRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/login");
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) return <></>;

  return children;
}
