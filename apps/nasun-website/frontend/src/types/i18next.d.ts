// src/types/i18next.d.ts

import "i18next";

import commonEN from "../assets/locales/en/common.json";
import homeEN from "../assets/locales/en/home.json";
import strategyEN from "../assets/locales/en/strategy.json";
import tokenomicsEN from "../assets/locales/en/tokenomics.json";
import riderStudioEN from "../assets/locales/en/riderStudio.json";
import wePopEN from "../assets/locales/en/wePop.json";
import genSolEN from "../assets/locales/en/genSol.json";
import spectraEN from "../assets/locales/en/spectra.json";
import heistEN from "../assets/locales/en/heist.json";
import roadmapEN from "../assets/locales/en/roadmap.json";
import opportunitiesEN from "../assets/locales/en/opportunities.json";
import grantsEN from "../assets/locales/en/grants.json";
import teamEN from "../assets/locales/en/team.json";
import saleEN from "../assets/locales/en/sale.json";
import myAccountEN from "../assets/locales/en/myAccount.json";
import leaderboardEN from "../assets/locales/en/leaderboard.json";
import battalionNftEN from "../assets/locales/en/battalion-nft.json";
import earlyContributorsEN from "../assets/locales/en/early-contributors.json";
import padoEN from "../assets/locales/en/pado.json";
import newsEN from "../assets/locales/en/news.json";
import notFoundEN from "../assets/locales/en/notFound.json";
import proposalsEN from "../assets/locales/en/proposals.json";
import baramEN from "../assets/locales/en/baram.json";
import padoVisionEN from "../assets/locales/en/pado-vision.json";
import padoTechEN from "../assets/locales/en/pado-tech.json";
import padoPitchEN from "../assets/locales/en/pado-pitch.json";
import padoRevisedEN from "../assets/locales/en/pado-revised.json";
import financeEN from "../assets/locales/en/finance.json";
import aboutEN from "../assets/locales/en/about.json";
import infraEN from "../assets/locales/en/infra.json";
import investorsEN from "../assets/locales/en/investors.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "home";
    resources: {
      common: typeof commonEN;
      home: typeof homeEN;
      strategy: typeof strategyEN;
      tokenomics: typeof tokenomicsEN;
      roadmap: typeof roadmapEN;
      grants: typeof grantsEN;
      riderStudio: typeof riderStudioEN;
      wePop: typeof wePopEN;
      genSol: typeof genSolEN;
      spectra: typeof spectraEN;
      heist: typeof heistEN;
      opportunities: typeof opportunitiesEN;
      team: typeof teamEN;
      sale: typeof saleEN;
      myAccount: typeof myAccountEN;
      leaderboard: typeof leaderboardEN;
      "battalion-nft": typeof battalionNftEN;
      "early-contributors": typeof earlyContributorsEN;
      pado: typeof padoEN;
      news: typeof newsEN;
      notFound: typeof notFoundEN;
      proposals: typeof proposalsEN;
      baram: typeof baramEN;
      "pado-vision": typeof padoVisionEN;
      "pado-tech": typeof padoTechEN;
      "pado-pitch": typeof padoPitchEN;
      "pado-revised": typeof padoRevisedEN;
      finance: typeof financeEN;
      about: typeof aboutEN;
      infra: typeof infraEN;
      investors: typeof investorsEN;
    };
  }
}
