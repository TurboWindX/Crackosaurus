import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@repo/shadcn/components/ui/button";

export const ErrorPage = () => {
  const { t } = useTranslation();

  return (
    <div className="grid h-screen content-center justify-items-center">
      <div className="grid justify-items-center gap-4">
        <div className="grid justify-items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <h1 className="text-2xl">{t("page.error.header")}</h1>
        </div>

        <Button>
          <Link to="/">{t("page.error.button")}</Link>
        </Button>
      </div>
    </div>
  );
};
