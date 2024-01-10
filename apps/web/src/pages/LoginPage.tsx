import { useState } from "react";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="grid h-screen grid-rows-3 lg:grid-cols-3">
      <div className="row-start-2 lg:col-start-2">
        <CardHeader>
          <CardTitle className="text-center">Crackosaurus</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password below to login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await login(email, password);
              navigate("/");
            }}
          >
            <Input
              type="text"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
