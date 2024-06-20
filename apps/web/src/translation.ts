import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import moment from "moment";
import { initReactI18next } from "react-i18next";

import en from "@repo/translation/en/translation.json";
import frMoment from "@repo/translation/fr/moment.ts";
import fr from "@repo/translation/fr/translation.json";

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
        translation: en,
      },
      fr: {
        translation: fr,
      },
    },
  });

moment.locale("fr", frMoment);

export default i18n;
