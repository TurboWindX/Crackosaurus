import { useTranslation } from "react-i18next";

export const HomePage = () => {
  const { t } = useTranslation();

  return (
    <div className="grid gap-2 p-4 text-justify">
      <h1 className="text-center text-2xl font-bold md:text-left">
        {t("page.home.header")}
      </h1>
      <p>{t("page.home.p1")}</p>
      <p>{t("page.home.p2")}</p>
      <div className="flex justify-center">
        <iframe
          title={t("page.home.video")}
          className="my-4 h-[135px] w-[240px] rounded-lg border sm:h-[180px] sm:w-[320px] md:h-[270px] md:w-[480px] lg:h-[540px] lg:w-[960px]"
          src="https://www.youtube.com/embed/z5OlO57livI"
          allowFullScreen
        />
      </div>
    </div>
  );
};
