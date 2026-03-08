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
import roadmapEN from "../assets/locales/en/roadmap.json";
import grantsEN from "../assets/locales/en/grants.json";
import teamEN from "../assets/locales/en/team.json";
import saleEN from "../assets/locales/en/sale.json";
import myAccountEN from "../assets/locales/en/myAccount.json";
import leaderboardEN from "../assets/locales/en/leaderboard.json";
import earlyContributorsEN from "../assets/locales/en/early-contributors.json";
import newsEN from "../assets/locales/en/news.json";
import notFoundEN from "../assets/locales/en/notFound.json";
import proposalsEN from "../assets/locales/en/proposals.json";
import baramEN from "../assets/locales/en/baram.json";
import financeEN from "../assets/locales/en/finance.json";
import aboutEN from "../assets/locales/en/about.json";
import infraEN from "../assets/locales/en/infra.json";
import investorsEN from "../assets/locales/en/investors.json";
import partnerEN from "../assets/locales/en/partner.json";
import devInvestorsEN from "../assets/locales/en/dev-investors.json";

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
      team: typeof teamEN;
      sale: typeof saleEN;
      myAccount: typeof myAccountEN;
      leaderboard: typeof leaderboardEN;
      "early-contributors": typeof earlyContributorsEN;
      news: typeof newsEN;
      notFound: typeof notFoundEN;
      proposals: typeof proposalsEN;
      baram: typeof baramEN;
      finance: typeof financeEN;
      about: typeof aboutEN;
      infra: typeof infraEN;
      investors: typeof investorsEN;
      partner: typeof partnerEN;
      "dev-investors": typeof devInvestorsEN;
    };
  }
}
