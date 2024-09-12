import { useState } from "react";
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
import { useErrors } from "@repo/ui/errors";

export const SetupPage = () => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const { handleError } = useErrors();

  const { mutateAsync: init } = trpc.init.useMutation({
    onSuccess() {
      navigate("/");
    },
    onError: handleError,
  });

  return (
    <div className="grid h-screen grid-rows-3 lg:grid-cols-3">
      <div className="row-start-2 lg:col-start-2">
        <CardHeader>
          <CardTitle className="text-center">{t("page.setup.title")}</CardTitle>
          <CardDescription className="text-center">
            {t("page.setup.header")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await init({ username, password });
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
            <Button>{t("page.setup.button")}</Button>
          </form>
        </CardContent>
      </div>
    </div>
  );
};
