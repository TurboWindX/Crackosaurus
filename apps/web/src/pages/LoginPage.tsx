import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@repo/shadcn/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/shadcn/components/ui/card";
import { Input } from "@repo/shadcn/components/ui/input";
import { useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { useErrors } from "@repo/ui/errors";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [redirect, setRedirect] = useState(false);

  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const authQueryKey = getQueryKey(trpc.auth.get, undefined, "any");

  const { mutateAsync: login } = trpc.auth.login.useMutation({
    onSuccess() {
      queryClient.invalidateQueries(authQueryKey);
    },
    onError: handleError,
  });

  useEffect(() => {
    if (redirect && isAuthenticated) navigate("/");
  }, [redirect, isAuthenticated]);

  return (
    <div className="grid h-screen lg:grid-cols-3">
      <div className="content-center lg:col-start-2">
        <CardHeader>
          <CardTitle className="text-center">{t("app")}</CardTitle>
          <CardDescription className="text-center">
            {t("page.login.header")}
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
              placeholder={t("item.username.singular")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              type="password"
              placeholder={t("item.password.singular")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button>{t("page.login.button")}</Button>
          </form>
        </CardContent>
      </div>
    </div>
  );
};
