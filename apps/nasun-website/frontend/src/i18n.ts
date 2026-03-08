import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";

declare const __BUILD_TIMESTAMP__: string;

// Only bundle critical namespaces for instant rendering (common + home)
// All other namespaces are loaded on-demand via HTTP backend from /locales/
import enCommon from "./assets/locales/en/common.json";
import enHome from "./assets/locales/en/home.json";

i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    // Only bundle common + home; all other namespaces loaded via backend
    partialBundledLanguages: true,
    resources: {
      en: {
        common: enCommon,
        home: enHome,
      },
    },
    lng: "en",
    fallbackLng: "en",
    ns: [
      "common",
      "home",
      "strategy",
      "tokenomics",
      "roadmap",
      "riderStudio",
      "wePop",
      "genSol",
      "spectra",
      "grants",
      "team",
      "sale",
      "myAccount",
      "early-contributors",
      "leaderboard",
      "notFound",
      "proposals",
      "news",
      "baram",
      "finance",
      "about",
      "infra",
      "investors",
      "partner",
      "dev-investors",
    ],
    defaultNS: "home",
    backend: {
      loadPath: `/locales/{{lng}}/{{ns}}.json?v=${__BUILD_TIMESTAMP__}`,
    },
    interpolation: {
      escapeValue: false, // React handles XSS protection
    },
    returnObjects: true,
  });

export default i18n;
