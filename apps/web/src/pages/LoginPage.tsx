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
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [redirect, setRedirect] = useState(false);

  const { handleError } = useErrors();
  const utils = trpc.useContext();

  const { mutateAsync: login } = trpc.auth.login.useMutation({
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
            {mfaRequired
              ? t("mfa.loginPrompt", {
                  defaultValue: "Enter the code from your authenticator app",
                })
              : t("page.login.header")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-2"
            onSubmit={async (event) => {
              event.preventDefault();

              try {
                const result = await login({
                  username,
                  password,
                  mfaCode: mfaRequired ? mfaCode : undefined,
                });

                // Password was correct but the account has 2FA: reveal the code
                // field and wait for the user to re-submit with a code.
                if (result.status === "MFA_REQUIRED") {
                  setMfaRequired(true);
                  return;
                }

                await utils.auth.get.fetch();
                setRedirect(true);
              } catch {
                // Surfaced by the mutation's onError handler.
              }
            }}
          >
            <Input
              type="text"
              placeholder={t("item.username.singular")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={mfaRequired}
            />
            <Input
              type="password"
              placeholder={t("item.password.singular")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={mfaRequired}
            />
            {mfaRequired && (
              <>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder={t("mfa.code", {
                    defaultValue: "Authentication code",
                  })}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t("mfa.codeHint", {
                    defaultValue:
                      "Enter the 6-digit code from your authenticator app, or a recovery code.",
                  })}
                </p>
              </>
            )}
            <Button>
              {mfaRequired
                ? t("mfa.verify", { defaultValue: "Verify" })
                : t("page.login.button")}
            </Button>
          </form>
        </CardContent>
      </div>
    </div>
  );
};
