import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { APIError, PermissionType, hasPermission } from "@repo/api";

import { useAPI } from "./api";
import { AuthContext, AuthInterface } from "./contexts";
import { useErrors } from "./errors";

export function AuthProvider({ children }: { children: any }) {
  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { data, isLoading, isLoadingError, isError } = useQuery({
    queryKey: ["auth"],
    queryFn: API.authUser,
    retry: (count, err) => {
      if (err instanceof APIError && err.status === 401) return false;

      return count < 3;
    },
    refetchOnWindowFocus: false,
  });

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

  const { mutateAsync: init } = useMutation({
    mutationFn: API.init,
    onError: handleError,
  });

  const { mutateAsync: login } = useMutation({
    mutationFn: API.login,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["auth"],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: logout } = useMutation({
    mutationFn: API.logout,
    onSuccess() {
      queryClient.invalidateQueries();
    },
    onError: handleError,
  });

  const value: AuthInterface = {
    isLoading,
    init,
    login,
    logout,
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
  children: any;
}) {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, hasPermission } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) navigate("/login");
      else if (!hasPermission(permission)) navigate("/");
    }
  }, [isLoading, isAuthenticated, hasPermission]);

  if (isLoading) <></>;

  return children;
}

export function AuthRoute({ children }: { children: any }) {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/login");
  }, [isLoading, isAuthenticated]);

  if (isLoading) <></>;

  return children;
}
