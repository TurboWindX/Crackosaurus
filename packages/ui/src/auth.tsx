import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { Navigate } from "react-router-dom";

import { PermissionType, hasPermission } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { REQ } from "@repo/api/server/client/web";

import { useAPI } from "./api";

export interface AuthInterface {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly uid: string;
  readonly username: string;
  readonly init: (req: REQ<APIType["init"]>) => Promise<any>;
  readonly login: (req: REQ<APIType["login"]>) => Promise<any>;
  readonly logout: (req: REQ<APIType["logout"]>) => Promise<any>;
  readonly hasPermission: (permission: PermissionType) => boolean;
}

const AuthContext = createContext<AuthInterface>({
  isLoading: true,
  isAuthenticated: false,
  uid: "",
  username: "",
  init: async () => false,
  login: async () => false,
  logout: async () => false,
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: any }) {
  const API = useAPI();

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth"],
    queryFn: API.authUser,
  });

  const { mutateAsync: init } = useMutation({
    mutationFn: API.init,
  });

  const { mutateAsync: login } = useMutation({
    mutationFn: API.login,
    onSuccess() {
      queryClient.invalidateQueries();
    },
  });

  const { mutateAsync: logout } = useMutation({
    mutationFn: API.logout,
    onSuccess() {
      queryClient.invalidateQueries();
    },
  });

  const value: AuthInterface = {
    isLoading,
    init,
    login,
    logout,
    uid: data?.uid ?? "",
    username: data?.username ?? "username",
    isAuthenticated: data?.uid !== undefined,
    hasPermission: (permission: PermissionType) =>
      hasPermission(data?.permissions ?? "", permission),
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
  const { isLoading, hasPermission } = useAuth();

  if (!isLoading && !hasPermission(permission))
    return <Navigate to="/" replace />;

  return children;
}

export function AuthRoute({ children }: { children: any }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (!isLoading && !isAuthenticated) return <Navigate to="/login" replace />;

  return children;
}
