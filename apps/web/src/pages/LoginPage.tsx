import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@repo/shadcn/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/shadcn/components/ui/card";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAuth } from "@repo/ui/auth";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [redirect, setRedirect] = useState(false);

  useEffect(() => {
    if (redirect && isAuthenticated) navigate("/");
  }, [redirect, isAuthenticated]);

  return (
    <div className="grid h-screen lg:grid-cols-3">
      <div className="content-center lg:col-start-2">
        <CardHeader>
          <CardTitle className="text-center">Crackosaurus</CardTitle>
          <CardDescription className="text-center">
            Enter your username and password below to login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-2"
            onSubmit={async (event) => {
              event.preventDefault();

              setRedirect(true);

              await login({ username, password });
            }}
          >
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button>Login</Button>
          </form>
        </CardContent>
      </div>
    </div>
  );
};
