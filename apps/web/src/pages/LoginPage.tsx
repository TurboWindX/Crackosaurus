import { useState } from "react";

import { Button } from "@repo/shadcn/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/shadcn/components/ui/card";
import { Input } from "@repo/shadcn/components/ui/input";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { toast } = useToast();

  return (
    <div className="grid lg:grid-cols-3 grid-rows-3 h-screen">
      <div className="lg:col-start-2 row-start-2">
        <CardHeader>
          <CardTitle className="text-center">Crackosaurus</CardTitle>
          <CardDescription className="text-center">Enter your email and password below to login</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button onClick={() => toast({
              variant: "destructive",
              title: "Uh oh! Something went wrong.",
              description: "Login Failed"
            })}>Login</Button>
          </div>
        </CardContent>
      </div>
    </div>
  )
};
