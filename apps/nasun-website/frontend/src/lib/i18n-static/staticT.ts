import common from "../../assets/locales/en/common.json";
import home from "../../assets/locales/en/home.json";
import about from "../../assets/locales/en/about.json";
import baram from "../../assets/locales/en/baram.json";
import devInvestors from "../../assets/locales/en/dev-investors.json";
import earlyContributors from "../../assets/locales/en/early-contributors.json";
import genSol from "../../assets/locales/en/genSol.json";
import grants from "../../assets/locales/en/grants.json";
import infra from "../../assets/locales/en/infra.json";
import investors from "../../assets/locales/en/investors.json";
import leaderboard from "../../assets/locales/en/leaderboard.json";
import myAccount from "../../assets/locales/en/myAccount.json";
import news from "../../assets/locales/en/news.json";
import notFound from "../../assets/locales/en/notFound.json";
import partner from "../../assets/locales/en/partner.json";
import proposals from "../../assets/locales/en/proposals.json";
import riderStudio from "../../assets/locales/en/riderStudio.json";
import roadmap from "../../assets/locales/en/roadmap.json";
import sale from "../../assets/locales/en/sale.json";
import spectra from "../../assets/locales/en/spectra.json";
import strategy from "../../assets/locales/en/strategy.json";
import team from "../../assets/locales/en/team.json";
import tokenomics from "../../assets/locales/en/tokenomics.json";
import wePop from "../../assets/locales/en/wePop.json";

export const locales = {
  common,
  home,
  about,
  baram,
  "dev-investors": devInvestors,
  "early-contributors": earlyContributors,
  genSol,
  grants,
  infra,
  investors,
  leaderboard,
  myAccount,
  news,
  notFound,
  partner,
  proposals,
  riderStudio,
  roadmap,
  sale,
  spectra,
  strategy,
  team,
  tokenomics,
  wePop,
} as const;

export type LocaleNamespace = keyof typeof locales;

/**
 * 정적 텍스트를 반환하는 헬퍼 함수.
 * i18next를 대체하며, 빌드 타임에 JSON을 번들에 포함시킵니다.
 */
export function getStaticT(ns: LocaleNamespace = "common") {
  return function t(key: string, options?: any): any {
    // 1. 요청된 네임스페이스에서 검색
    let result = getValueByPath(locales[ns], key);

    // 2. 찾지 못했고 현재 네임스페이스가 common이 아니라면 common에서 다시 검색 (i18next fallback 동작)
    if (result === undefined && ns !== "common") {
      result = getValueByPath(locales["common"], key);
    }

    // 3. 여전히 없으면 키 자체 반환
    if (result === undefined) {
      return key;
    }

    // {{name}} 형태의 보간(interpolation) 처리
    if (typeof result === "string" && options) {
      return result.replace(/\{\{(.+?)\}\}/g, (_, p1) => {
        const value = options[p1.trim()];
        return value !== undefined ? value : `{{${p1}}}`;
      });
    }

    return result;
  };
}

/** 객체 경로 탐색 헬퍼 */
function getValueByPath(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}
