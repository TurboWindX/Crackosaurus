import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import moment from "moment";
import { initReactI18next } from "react-i18next";

import frMoment from "@repo/translation/fr/moment.ts";

const initializeI18n = async () => {
  const [en, fr] = await Promise.all([
    import("@repo/translation/en/translation.json"),
    import("@repo/translation/fr/translation.json"),
  ]);

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: "en",
      interpolation: {
        escapeValue: false,
      },
      resources: {
        en: {
          translation: en.default,
        },
        fr: {
          translation: fr.default,
        },
      },
    });

  moment.locale("fr", frMoment);

  return i18n;
};

const i18nPromise = initializeI18n();

export default i18nPromise;
