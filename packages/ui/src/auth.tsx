import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import {
  AuthUserResponse,
  PermissionType,
  authUser,
  hasPermission,
  login,
  logout,
} from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

export interface AuthInterface {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly uid: number;
  readonly username: string;
  readonly login: (username: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly hasPermission: (permission: PermissionType) => boolean;
}

const AuthContext = createContext<AuthInterface>(null as any);

export function AuthProvider({ children }: { children: any }) {
  const [isLoading, setLoading] = useState(true);
  const [data, setData] = useState<AuthUserResponse | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);

    (async () => {
      const data = await authUser();
      setData(data);

      setLoading(false);
    })();
  }, []);

  async function authLogin(username: string, password: string) {
    const { response, error } = await login({ username, password });

    setLoading(true);
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error,
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
    const { response, error } = await logout();

    setLoading(true);
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error,
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
    login: authLogin,
    logout: authLogout,
    uid: data?.uid ?? -1,
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
