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
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand / hero side — hidden on small screens, where the form takes over. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 p-10 lg:flex">
        <div className="space-y-1">
          <div className="text-2xl font-bold tracking-tight">
            Crackosaurus <span aria-hidden="true">🦖</span>
          </div>
          <p className="text-sm text-slate-400">
            Password recovery built for practitioners.
          </p>
        </div>

        <DinoChomp className="h-56 shrink-0" />

        <p className="text-xs text-slate-400">
          Organize targets, add hashes, upload big wordlists, and crack.
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            {/* Compact wordmark for small screens where the hero is hidden. */}
            <div className="text-2xl font-bold tracking-tight lg:hidden">
              Crackosaurus <span aria-hidden="true">🦖</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t("app")}</h1>
            <p className="text-sm text-slate-400">{t("page.login.header")}</p>
          </div>

          <form
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm"
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
