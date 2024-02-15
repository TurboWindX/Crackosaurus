import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import {
  AuthUserResponse,
  PermissionType,
  authUser,
  hasPermission,
  init,
  login,
  logout,
} from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { useRequests } from "./requests";

export interface AuthInterface {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly uid: string;
  readonly username: string;
  readonly init: (username: string, password: string) => Promise<boolean>;
  readonly login: (username: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly invalidate: () => void;
  readonly hasPermission: (permission: PermissionType) => boolean;
}

const AuthContext = createContext<AuthInterface>({
  isLoading: true,
  isAuthenticated: false,
  uid: "",
  username: "",
  init: async () => false,
  login: async () => {},
  logout: async () => {},
  invalidate: () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: any }) {
  const { toast } = useToast();

  const [isLoading, setLoading] = useState(true);
  const [data, setData] = useState<AuthUserResponse | null>(null);

  useEffect(() => {
    setLoading(true);

    (async () => {
      const data = await authUser();
      setData(data);

      setLoading(false);
    })();
  }, []);

  async function authInit(username: string, password: string) {
    setLoading(true);

    const { response, error } = await init({ username, password });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } else {
      toast({
        variant: "default",
        title: "Success",
        description: response,
      });
    }

    setLoading(false);

    return error === undefined;
  }

  async function authLogin(username: string, password: string) {
    setLoading(true);

    const { response, error } = await login({ username, password });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });

      setData(null);
    } else {
      toast({
        variant: "default",
        title: "Success",
        description: response,
      });

      const data = await authUser();
      setData(data);
    }
    setLoading(false);
  }

  async function authLogout() {
    setLoading(true);

    const { response, error } = await logout();

    if (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error.message,
      });
    } else {
      toast({
        variant: "default",
        title: "Success",
        description: response,
      });

      setData(null);
    }

    setLoading(false);
  }

  const value: AuthInterface = {
    init: authInit,
    login: authLogin,
    logout: authLogout,
    invalidate: () => {
      setData(null);
      setLoading(false);
    },
    uid: data?.uid ?? "",
    username: data?.username ?? "username",
    isLoading,
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
