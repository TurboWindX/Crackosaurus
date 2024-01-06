import { createContext, useContext, useEffect, useState } from "react";
import { AuthUserResponse, authUser, login } from "@repo/api";
import { Navigate } from "react-router-dom";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

export interface AuthInterface {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly isAdmin: boolean;
  readonly uid: string;
  readonly username: string;
  readonly login: (email: string, password: string) => Promise<void>;
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

  async function authLogin(email: string, password: string) {
    const loginData = await login({ username: email, password });

    if (loginData.error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: loginData.error,
      });
    } else {
      toast({
        variant: "default",
        title: "Success",
        description: loginData.response,
      });

      setLoading(true);
      const data = await authUser();
      setData(data);
      setLoading(false);
    }
  }

  const value: AuthInterface = {
    login: authLogin,
    uid: data?.uid ?? "-1",
    username: data?.username ?? "username",
    isLoading,
    isAuthenticated: data?.uid !== undefined,
    isAdmin: data?.isAdmin === true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthRoute({ children }: { children: any }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (!isLoading && !isAuthenticated) return <Navigate to="/login" replace />;

  return children;
}

export function AdminRoute({ children }: { children: any }) {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();

  if (!isLoading) {
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    else if (!isAdmin) return <Navigate to="/" replace />;
  }

  return children;
}
