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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 p-6">
      {/* Full-bleed animated mascot as a faint backdrop behind the card.
          Wrapped in an absolute layer so DinoChomp keeps its own `relative`
          (needed to anchor its internal absolutely-positioned rows) without
          the two position utilities colliding. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
        <DinoChomp bare aria-hidden className="h-full w-full" />
      </div>

      {/* Login card floating dead-center on top of the backdrop. */}
      <div className="relative z-10 w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl backdrop-blur">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Crackosaurus <span aria-hidden="true">🦖</span>
          </h1>
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
  );
};
