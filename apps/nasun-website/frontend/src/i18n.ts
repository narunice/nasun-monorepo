import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./assets/locales/en/common.json";
import koCommon from "./assets/locales/ko/common.json";
import enHome from "./assets/locales/en/home.json";
import koHome from "./assets/locales/ko/home.json";
import enVisionStrategy from "./assets/locales/en/strategy.json";
import koVisionStrategy from "./assets/locales/ko/strategy.json";
import enVisionTokenomics from "./assets/locales/en/tokenomics.json";
import koVisionTokenomics from "./assets/locales/ko/tokenomics.json";
import enIpsRiderStudio from "./assets/locales/en/riderStudio.json";
import koIpsRiderStudio from "./assets/locales/ko/riderStudio.json";
import enIpsWePop from "./assets/locales/en/wePop.json";
import koIpsWePop from "./assets/locales/ko/wePop.json";
import enIpsGenSol from "./assets/locales/en/genSol.json";
import koIpsGenSol from "./assets/locales/ko/genSol.json";
import enIpsSpectra from "./assets/locales/en/spectra.json";
import koIpsSpectra from "./assets/locales/ko/spectra.json";
import enIpsHeist from "./assets/locales/en/heist.json";
import koIpsHeist from "./assets/locales/ko/heist.json";

import enOpportunities from "./assets/locales/en/opportunities.json";
import koOpportunities from "./assets/locales/ko/opportunities.json";
import enGrants from "./assets/locales/en/grants.json";
import koGrants from "./assets/locales/ko/grants.json";
import enTeam from "./assets/locales/en/team.json";
import koTeam from "./assets/locales/ko/team.json";

import enSale from "./assets/locales/en/sale.json";
import koSale from "./assets/locales/ko/sale.json";
import enMyAccount from "./assets/locales/en/myAccount.json";
import koMyAccount from "./assets/locales/ko/myAccount.json";
import enPrivacyPolicy from "./assets/locales/en/privacyPolicy.json";
import koPrivacyPolicy from "./assets/locales/ko/privacyPolicy.json";
import enTerms from "./assets/locales/en/terms.json";
import koTerms from "./assets/locales/ko/terms.json";
import enLeaderboard from "./assets/locales/en/leaderboard.json";
import koLeaderboard from "./assets/locales/ko/leaderboard.json";
import enBattalionNft from "./assets/locales/en/battalion-nft.json";
import koBattalionNft from "./assets/locales/ko/battalion-nft.json";
import enEarlyContributors from "./assets/locales/en/early-contributors.json";
import koEarlyContributors from "./assets/locales/ko/early-contributors.json";
import enRoadmap from "./assets/locales/en/roadmap.json";
import koRoadmap from "./assets/locales/ko/roadmap.json";
import enPado from "./assets/locales/en/pado.json";
import koPado from "./assets/locales/ko/pado.json";
import enNews from "./assets/locales/en/news.json";
import koNews from "./assets/locales/ko/news.json";
import enProposals from "./assets/locales/en/proposals.json";
import koProposals from "./assets/locales/ko/proposals.json";

i18n
  .use(Backend) // JSON 파일 동적 로딩
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        home: enHome,
        strategy: enVisionStrategy,
        tokenomics: enVisionTokenomics,
        riderStudio: enIpsRiderStudio,
        wePop: enIpsWePop,
        genSol: enIpsGenSol,
        spectra: enIpsSpectra,
        heist: enIpsHeist,

        opportunities: enOpportunities,
        grants: enGrants,
        team: enTeam,
        sale: enSale,
        myAccount: enMyAccount,
        privacyPolicy: enPrivacyPolicy,
        terms: enTerms,
        leaderboard: enLeaderboard,
        "battalion-nft": enBattalionNft,
        "early-contributors": enEarlyContributors,
        roadmap: enRoadmap,
        pado: enPado,
        news: enNews,
        proposals: enProposals,
      },
      ko: {
        common: koCommon,
        home: koHome,
        strategy: koVisionStrategy,
        tokenomics: koVisionTokenomics,
        riderStudio: koIpsRiderStudio,
        wePop: koIpsWePop,
        genSol: koIpsGenSol,
        spectra: koIpsSpectra,
        heist: koIpsHeist,

        opportunities: koOpportunities,
        grants: koGrants,
        team: koTeam,
        sale: koSale,
        myAccount: koMyAccount,
        privacyPolicy: koPrivacyPolicy,
        terms: koTerms,
        leaderboard: koLeaderboard,
        "battalion-nft": koBattalionNft,
        "early-contributors": koEarlyContributors,
        roadmap: koRoadmap,
        pado: koPado,
        news: koNews,
        proposals: koProposals,
      },
    },
    fallbackLng: "en",
    ns: [
      "common",
      "home",
      "strategy",
      "products",
      "web3",
      "tokenomics",
      "manifesto",
      "story",

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
      "privacyPolicy",
      "terms",
      "leaderboard",
      "battalion-nft",
      "early-contributors",
      "notFound",
      "proposals",
      "pado",
      "news",
    ], // 모든 네임스페이스 등록
    defaultNS: "home",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json", // 파일 경로
    },
    interpolation: {
      escapeValue: false, // React XSS 보호 기본 적용
    },
    returnObjects: true,
    detection: {
      order: ["querystring", "cookie", "localStorage", "navigator", "htmlTag"],
      caches: ["cookie", "localStorage"],
    },
  });

// 언어 변경 감지 후 HTML lang 속성 업데이트
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
