import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

// Only bundle critical namespaces for instant rendering (common + home)
// All other namespaces are loaded on-demand via HTTP backend from /locales/
import enCommon from "./assets/locales/en/common.json";
import koCommon from "./assets/locales/ko/common.json";
import enHome from "./assets/locales/en/home.json";
import koHome from "./assets/locales/ko/home.json";

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Only bundle common + home; all other namespaces loaded via backend
    partialBundledLanguages: true,
    resources: {
      en: {
        common: enCommon,
        home: enHome,
      },
      ko: {
        common: koCommon,
        home: koHome,
      },
    },
    fallbackLng: "en",
    load: "languageOnly", // Strip region codes: en-US → en, ko-KR → ko
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
      "heist",
      "opportunities",
      "grants",
      "team",
      "sale",
      "myAccount",
      "battalion-nft",
      "early-contributors",
      "leaderboard",
      "notFound",
      "proposals",
      "pado",
      "news",
      "baram",
      "pado-vision",
      "pado-tech",
      "pado-pitch",
      "pado-revised",
      "pado-draft",
      "finance",
      "about",
      "infra",
      "investors",
    ],
    defaultNS: "home",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    interpolation: {
      escapeValue: false, // React handles XSS protection
    },
    returnObjects: true,
    detection: {
      order: ["querystring", "cookie", "localStorage"],
      caches: ["cookie", "localStorage"],
    },
  });

// Update HTML lang attribute on language change
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
