import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { useErrors } from "@repo/ui/errors";

import { DinoChomp } from "../components/DinoChomp";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const trpc = useTRPC();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [redirect, setRedirect] = useState(false);

  const { handleError } = useErrors();
  const utils = trpc.useContext();

  const { mutateAsync: login } = trpc.auth.login.useMutation({
    async onSuccess() {
      await utils.auth.get.fetch();
    },
    onError: handleError,
  });

  useEffect(() => {
    if (redirect && isAuthenticated) navigate("/");
  }, [redirect, isAuthenticated]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="space-y-1 text-center">
          <div className="text-3xl font-bold tracking-tight">
            Crackosaurus <span aria-hidden="true">🦖</span>
          </div>
          <p className="text-sm text-slate-400">
            Password recovery built for practitioners.
          </p>
        </div>

        {/* Animated mascot: a dino chomping hashes into plaintext. */}
        <DinoChomp className="h-40 sm:h-44" />

        {/* Login card */}
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{t("app")}</h1>
            <p className="text-sm text-slate-400">{t("page.login.header")}</p>
          </div>

          <form
            className="grid grid-cols-1 gap-3"
            onSubmit={async (event) => {
              event.preventDefault();

              setRedirect(true);

              await login({ username, password });
            }}
          >
            <label htmlFor="login-username" className="sr-only">
              {t("item.username.singular")}
            </label>
            <Input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder={t("item.username.singular")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <label htmlFor="login-password" className="sr-only">
              {t("item.password.singular")}
            </label>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder={t("item.password.singular")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button className="w-full">{t("page.login.button")}</Button>
          </form>
        </div>
      </div>
    </div>
  );
};
