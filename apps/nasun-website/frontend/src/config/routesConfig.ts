// src/config/routesConfig.ts
import { EnhancedRouteConfigBuilder } from "../types/routes.d";
import { TFunction } from "i18next";
import { lazyWithRetry } from "../utils/lazyWithRetry";

// 페이지 컴포넌트 lazy loading
export const Pages = {
  Home: lazyWithRetry(() => import("../pages/HomePage")),
  VisionStrategy: lazyWithRetry(() => import("../pages/about/StrategyPage")),
  VisionNetwork: lazyWithRetry(() => import("../pages/protocol/NetworkPage")),
  IPs: lazyWithRetry(() => import("../pages/IPsPage")),
  IPsGenSol: lazyWithRetry(() => import("../pages/ips/gensol/GenSolMainPage")),
  IPsGenSolOverview: lazyWithRetry(() => import("../pages/ips/gensol/OverviewPage")),
  IPsGenSolShooter: lazyWithRetry(() => import("../pages/ips/gensol/ShooterPage")),
  IPsGenSolHeist: lazyWithRetry(() => import("../pages/ips/gensol/HeistPage")),
  FinancePado: lazyWithRetry(() => import("../pages/finance/PadoPage")),
  IPsWePop: lazyWithRetry(() => import("../pages/ips/WePopPage")),
  IPsRiderStudioMain: lazyWithRetry(() => import("../pages/ips/riderstudio/RiderStudioMainPage")),
  IPsRiderStudioOverview: lazyWithRetry(() => import("../pages/ips/riderstudio/RiderStudioOverviewPage")),
  Roadmap: lazyWithRetry(() => import("../pages/RoadmapPage")),
  Opportunities: lazyWithRetry(() => import("../pages/about/OpportunitiesPage")),
  Grants: lazyWithRetry(() => import("../pages/AwardsPage")),
  Founders: lazyWithRetry(() => import("../pages/about/FoundersPage")),
  GenesisNft: lazyWithRetry(() => import("../pages/GenesisNftPage")),
  Web3: lazyWithRetry(() => import("../pages/protocol/ProposalPage")),
  ProposalDetail: lazyWithRetry(() => import("../pages/protocol/ProposalDetailPage")),
  MyAccountPage: lazyWithRetry(() => import("../pages/MyAccountPage")),
  PrivacyPolicy: lazyWithRetry(() => import("../pages/PrivacyPolicyPage")),
  TermsOfUse: lazyWithRetry(() => import("../pages/TermsOfUsePage")),
  PostDetailPage: lazyWithRetry(() => import("../pages/PostDetailPage")), // Headless WP Post Page
  News: lazyWithRetry(() => import("../pages/NewsPage")),
  Callback: lazyWithRetry(() => import("@/features/auth").then(module => ({ default: module.Callback }))),
  Logout: lazyWithRetry(() => import("../pages/LogoutPage")),
  LeaderboardV3: lazyWithRetry(() => import("../pages/LeaderboardV3Page")),
  AiEconomy: lazyWithRetry(() => import("../pages/ecosystem/AiEconomyPage")),
  // Wave 1 Campaign Pages
  BattalionNft: lazyWithRetry(() => import("../pages/wave1/BattalionNftPage")),
  EarlyContributors: lazyWithRetry(() => import("../pages/wave1/EarlyContributorsPage")),
  LeaderboardInfo: lazyWithRetry(() => import("../pages/wave1/LeaderboardInfoPage")),
  // Protocol Pages
  ProtocolOverview: lazyWithRetry(() => import("../pages/protocol/ProtocolOverviewPage")),
  // About Pages
  About: lazyWithRetry(() => import("../pages/AboutPage")),
  AboutTeam: lazyWithRetry(() => import("../pages/about/TeamPage")),
  // Ecosystem Pages
  PadoVision: lazyWithRetry(() => import("../pages/ecosystem/PadoVisionPage")),
  PadoTech: lazyWithRetry(() => import("../pages/ecosystem/PadoTechPage")),
  PadoPitch: lazyWithRetry(() => import("../pages/ecosystem/PadoPitchPage")),
  PadoRevised: lazyWithRetry(() => import("../pages/ecosystem/PadoRevisedPage")),
  Baram: lazyWithRetry(() => import("../pages/ecosystem/BaramPage")),
  // Infra Pages
  InfraOverview: lazyWithRetry(() => import("../pages/infra/InfraOverviewPage")),
  // About Pages (new)
  AboutOverview: lazyWithRetry(() => import("../pages/about/AboutOverviewPage")),
  Investors: lazyWithRetry(() => import("../pages/about/InvestorsPage")),
  // 404 Page
  NotFound: lazyWithRetry(() => import("../pages/NotFoundPage")),
};

// 라우트 구성 정의
export const routesV2: EnhancedRouteConfigBuilder = {
  // 홈 페이지
  home: {
    path: "/",
    component: Pages.Home,
    navItem: {
      name: "navigation.home",
      path: "/",
      hidden: true,
    },
    meta: {
      title: "NASUN",
      description: "NASUN official website",
    },
  },

  // Protocol 섹션 (기존 Network에서 라벨 변경, path 유지)
  network: {
    path: "/network",
    component: Pages.VisionNetwork,
    navItem: {
      name: "navigation.protocol",
      path: "/network",
      subMenu: [
        {
          name: "navigation.nasunNetwork",
          path: "/network/nsn",
          element: Pages.VisionNetwork,
        },
        {
          name: "navigation.devnetWallet",
          path: import.meta.env.VITE_DEVNET_EXPLORER_URL || "https://explorer.nasun.io/devnet",
          external: true,
        },
        {
          name: "navigation.governance",
          path: "/network/governance",
          element: Pages.Web3,
        },
        {
          name: "navigation.identity",
          path: "/network/identity",
          element: Pages.VisionNetwork, // Placeholder
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.litepaper",
          path: "/network/litepaper",
          element: Pages.VisionNetwork, // Placeholder
          disabled: true, // Coming Soon
          external: true,
        },
      ],
    },
    meta: {
      title: "Protocol - NASUN",
      description: "NASUN Protocol",
    },
  },

  // Infra 섹션 (신설) - 메뉴에서 숨김 처리
  infra: {
    path: "/infra",
    component: Pages.InfraOverview,
    navItem: {
      name: "navigation.infra",
      path: "/infra",
      hidden: true, // 메뉴에서 숨김
      subMenu: [
        {
          name: "navigation.infraOverview",
          path: "/infra/overview",
          element: Pages.InfraOverview,
        },
        {
          name: "navigation.aiExecutors",
          path: "/infra/ai-executors",
          element: Pages.InfraOverview, // Placeholder
          disabled: true,
        },
        {
          name: "navigation.compute",
          path: "/infra/compute",
          element: Pages.InfraOverview, // Placeholder
          disabled: true,
        },
        {
          name: "navigation.storage",
          path: "/infra/storage",
          element: Pages.InfraOverview, // Placeholder
          disabled: true,
        },
        {
          name: "navigation.streaming",
          path: "/infra/streaming",
          element: Pages.InfraOverview, // Placeholder
          disabled: true,
        },
        {
          name: "navigation.gameServers",
          path: "/infra/game-servers",
          element: Pages.InfraOverview, // Placeholder
          disabled: true,
        },
      ],
    },
    meta: {
      title: "Infra - NASUN",
      description: "NASUN Decentralized Infrastructure",
    },
  },

  // Ecosystem 섹션 (IP 통합)
  ecosystem: {
    path: "/ecosystem",
    component: Pages.AiEconomy, // 기본 서브페이지: Baram - AI
    navItem: {
      name: "navigation.ecosystem",
      path: "/ecosystem",
      subMenu: [
        {
          name: "navigation.baramAi",
          path: "/ecosystem/ai-economy",
          element: Pages.AiEconomy,
        },
        {
          name: "navigation.padoFinance",
          path: "/ecosystem/finance",
          element: Pages.FinancePado,
        },
        {
          name: "navigation.genSol",
          path: "/ecosystem/gensol",
          element: Pages.IPsGenSol,
          subMenu: [
            {
              name: "navigation.genSolMain",
              path: "/ecosystem/gensol/main",
              element: Pages.IPsGenSol,
            },
            {
              name: "navigation.genSolShooter",
              path: "/ecosystem/gensol/shooter",
              element: Pages.IPsGenSolShooter,
            },
            {
              name: "navigation.genSolAnimation",
              path: "/ecosystem/gensol/animation",
              element: Pages.IPsGenSolHeist,
            },
            {
              name: "navigation.genSolPlan",
              path: "/ecosystem/gensol/plan",
              element: Pages.IPsGenSolOverview,
            },
          ],
        },
        {
          name: "navigation.riderStudio",
          path: "/ecosystem/riderstudio",
          element: Pages.IPsRiderStudioMain, // Placeholder
          disabled: true,
        },
        {
          name: "navigation.oneLight",
          path: "/ecosystem/1light",
          element: Pages.AiEconomy, // Placeholder
          disabled: true,
        },
      ],
    },
    meta: {
      title: "Ecosystem - NASUN",
      description: "NASUN Ecosystem",
    },
  },

  awards: {
    path: "/awards",
    component: Pages.Grants,
    navItem: {
      name: "navigation.awards",
      path: "/awards",
      hidden: true, // Updates 드롭다운으로 이동
    },
    meta: {
      title: "Awards - NASUN",
      description: "Awards and Grant programs",
    },
  },

  news: {
    path: "/news",
    component: Pages.News,
    navItem: {
      name: "navigation.news",
      path: "/news",
      hidden: true, // Updates 드롭다운으로 이동
    },
    meta: {
      title: "News - NASUN",
      description: "Latest news and updates",
    },
  },

  // Updates 섹션 (서브메뉴 있음)
  updates: {
    path: "/updates",
    component: Pages.News, // 기본 서브페이지로 News
    navItem: {
      name: "navigation.updates",
      path: "/updates",
      subMenu: [
        {
          name: "navigation.news",
          path: "/updates/news",
          element: Pages.News,
        },
        {
          name: "navigation.awards",
          path: "/updates/awards",
          element: Pages.Grants,
        },
        {
          name: "navigation.roadmap",
          path: "/updates/roadmap",
          element: Pages.Roadmap,
        },
      ],
    },
    meta: {
      title: "Updates - NASUN",
      description: "News, Awards, and Roadmap",
    },
  },

  // About 섹션 (서브메뉴 있음)
  about: {
    path: "/about",
    component: Pages.AboutOverview, // 기본 서브페이지: Overview
    navItem: {
      name: "navigation.about",
      path: "/about",
      subMenu: [
        {
          name: "navigation.aboutOverview",
          path: "/about/overview",
          element: Pages.AboutOverview,
        },
        {
          name: "navigation.founders",
          path: "/about/founders",
          element: Pages.Founders,
        },
        {
          name: "navigation.aboutTeam",
          path: "/about/team",
          element: Pages.AboutTeam,
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.opportunities",
          path: "/about/opportunities",
          element: Pages.Opportunities,
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.strategy",
          path: "/about/strategy",
          element: Pages.VisionStrategy,
        },
        {
          name: "navigation.investors",
          path: "/about/investors",
          element: Pages.Investors,
        },
      ],
    },
    meta: {
      title: "About - NASUN",
      description: "About NASUN",
    },
  },

  team: {
    path: "/team",
    component: Pages.Founders,
    navItem: {
      name: "navigation.team",
      path: "/team",
      hidden: true, // About 메뉴로 이동됨
      subMenu: [
        {
          name: "navigation.founders",
          path: "/team/founders",
          element: Pages.Founders,
        },
        {
          name: "navigation.opportunities",
          path: "/team/opportunities",
          element: Pages.Opportunities,
        },
      ],
    },
    meta: {
      title: "Team - NASUN",
      description: "Meet the NASUN team",
    },
  },

  // Wave 1 Campaign 섹션 (서브메뉴 있음)
  wave1Campaign: {
    path: "/wave1",
    component: Pages.BattalionNft, // 기본 서브페이지로 Battalion NFT
    navItem: {
      name: "navigation.wave1Campaign",
      path: "/wave1",
      subMenu: [
        {
          name: "navigation.battalionNft",
          path: "/wave1/battalion-nft",
          element: Pages.BattalionNft,
        },
        {
          name: "navigation.earlyContributors",
          path: "/wave1/early-contributors",
          element: Pages.EarlyContributors,
        },
        {
          name: "navigation.leaderboard",
          path: "/wave1/leaderboard",
          element: Pages.LeaderboardV3,
        },
        {
          name: "navigation.leaderboardInfo",
          path: "/wave1/leaderboard-info",
          element: Pages.LeaderboardInfo,
        },
        {
          name: "navigation.genesisEvent",
          path: "/wave1/frontiers-event",
          element: Pages.GenesisNft,
          disabled: true,
        },
        {
          name: "navigation.contests",
          path: "/wave1/contests",
          element: Pages.BattalionNft, // Placeholder - disabled anyway
          disabled: true, // Coming Soon
        },
      ],
    },
    meta: {
      title: "Wave 1 - NASUN",
      description: "Wave 1 activities and events",
    },
  },

  genesisNft: {
    path: "/wave1/frontiers-event",
    component: Pages.GenesisNft,
    navItem: {
      name: "navigation.genesisEvent",
      path: "/wave1/frontiers-event",
      hidden: true,
    },
    meta: {
      title: "Frontiers Event - NASUN",
      description: "NASUN Frontiers Event",
    },
  },

  leaderboard: {
    path: "/wave1/leaderboard",
    component: Pages.LeaderboardV3,
    navItem: {
      name: "navigation.leaderboard",
      path: "/wave1/leaderboard",
      hidden: true,
    },
    meta: {
      title: "Community Leaderboard - NASUN",
      description: "Community engagement leaderboard",
    },
  },

  // 보호된 라우트
  myAccount: {
    path: "/my-account",
    component: Pages.MyAccountPage,
    isProtected: true,
    navItem: {
      name: "navigation.myAccount",
      path: "/my-account",
      hidden: true,
    },
    meta: {
      title: "My Account - NASUN",
      description: "User account management",
      requiresAuth: true,
    },
  },

  // 숨겨진 라우트들
  privacy: {
    path: "/privacy-policy",
    component: Pages.PrivacyPolicy,
    navItem: {
      name: "navigation.privacy",
      path: "/privacy-policy",
      hidden: true,
    },
    meta: {
      title: "Privacy Policy - NASUN",
      description: "NASUN privacy policy",
    },
  },

  terms: {
    path: "/terms-of-use",
    component: Pages.TermsOfUse,
    navItem: {
      name: "navigation.terms",
      path: "/terms-of-use",
      hidden: true,
    },
    meta: {
      title: "Terms of Use - NASUN",
      description: "NASUN terms of service",
    },
  },

  logout: {
    path: "/logout",
    component: Pages.Logout,
    navItem: {
      name: "navigation.logout",
      path: "/logout",
      hidden: true,
    },
    meta: {
      title: "Logout - NASUN",
      description: "User logout page",
    },
  },

  postDetail: {
    path: "/awards-grants/:slug",
    component: Pages.PostDetailPage,
    navItem: {
      name: "navigation.postDetail",
      path: "/awards-grants/:slug",
      hidden: true,
    },
    meta: {
      title: "Post Detail - NASUN",
      description: "Award or Grant detail",
    },
  },

  padoNew: {
    path: "/pado-new",
    component: Pages.PadoVision,
    navItem: {
      name: "navigation.padoNew",
      path: "/pado-new",
      hidden: true,
    },
    meta: {
      title: "Pado - NASUN",
      description: "Pado: Unified Onchain Finance",
    },
  },

  padoNew2: {
    path: "/pado-new2",
    component: Pages.PadoTech,
    navItem: {
      name: "navigation.padoNew2",
      path: "/pado-new2",
      hidden: true,
    },
    meta: {
      title: "Pado Tech - NASUN",
      description: "Pado: Architecture That Composes",
    },
  },

  padoNew3: {
    path: "/pado-new3",
    component: Pages.PadoPitch,
    navItem: {
      name: "navigation.padoNew3",
      path: "/pado-new3",
      hidden: true,
    },
    meta: {
      title: "Pado Pitch - NASUN",
      description: "Pado: The Opportunity",
    },
  },

  padoRevised: {
    path: "/pado-revised",
    component: Pages.PadoRevised,
    navItem: {
      name: "navigation.padoRevised",
      path: "/pado-revised",
      hidden: true,
    },
    meta: {
      title: "Pado - NASUN",
      description: "Pado: Unified Onchain Finance",
    },
  },

  baram: {
    path: "/baram",
    component: Pages.Baram,
    navItem: {
      name: "navigation.baram",
      path: "/baram",
      hidden: true,
    },
    meta: {
      title: "Baram - NASUN",
      description: "Baram: AI Compliance Settlement Layer on Nasun Network",
    },
  },

  newsEventDetail: {
    path: "/news-events/:slug",
    component: Pages.PostDetailPage,
    navItem: {
      name: "navigation.newsEventDetail",
      path: "/news-events/:slug",
      hidden: true,
    },
    meta: {
      title: "News & Events - NASUN",
      description: "News and Events detail",
    },
  },
};

// 개선된 네비게이션 아이템 생성 함수 (Phase 2)
export const getNavItemsV2 = (t: TFunction<"common", undefined>) => {
  return Object.values(routesV2)
    .filter((route) => route.navItem && !route.navItem.hidden)
    .map((route) => ({
      ...route.navItem!,
      name: t(route.navItem!.name as never),
      subMenu: route.navItem!.subMenu?.map((subItem) => ({
        ...subItem,
        name: t(subItem.name as never),
        path:
          subItem.path.startsWith("/") || subItem.path.startsWith("http")
            ? subItem.path
            : `${route.path}/${subItem.path}`,
        parentPath: route.path,
        // 재귀적으로 중첩 서브메뉴 처리 (3단계 중첩 지원)
        subMenu: subItem.subMenu?.map((nestedItem) => ({
          ...nestedItem,
          name: t(nestedItem.name as never),
          path:
            nestedItem.path.startsWith("/") || nestedItem.path.startsWith("http")
              ? nestedItem.path
              : `${subItem.path}/${nestedItem.path}`,
          parentPath: subItem.path,
        })),
      })),
    }))
    .sort((a, b) => {
      // 정렬 순서: network, infra, ecosystem, updates, about, wave1
      const order = [
        "network",
        "infra",
        "ecosystem",
        "updates",
        "about",
        "wave1",
      ];
      const aIndex = order.findIndex((item) => a.path.includes(item));
      const bIndex = order.findIndex((item) => b.path.includes(item));
      return aIndex - bIndex;
    });
};

// Centralized page title maps for nested route rendering
export const pageTitleMaps: Record<string, Record<string, string>> = {
  network: {
    "navigation.nasunNetwork": "Nasun Network",
    "navigation.protocolOverview": "Protocol Overview",
    "navigation.governance": "Governance",
    "navigation.identity": "Identity",
  },
  infra: {
    "navigation.infraOverview": "Infra Overview",
    "navigation.aiExecutors": "AI Executors",
    "navigation.compute": "Compute",
    "navigation.storage": "Storage",
    "navigation.streaming": "Streaming",
    "navigation.gameServers": "Game Servers",
  },
  ecosystem: {
    "navigation.baramAi": "Baram - AI",
    "navigation.padoFinance": "Pado - Finance",
    "navigation.genSol": "GenSol",
    "navigation.genSolMain": "GenSol",
    "navigation.genSolPlan": "GenSol Plan",
    "navigation.genSolShooter": "Multiplayer Shooter",
    "navigation.genSolAnimation": "Animation Series",
    "navigation.riderStudio": "Rider Studio",
    "navigation.oneLight": "1Light",
  },
  team: {
    "navigation.founders": "Founders",
    "navigation.opportunities": "Opportunities",
  },
  wave1: {
    "navigation.battalionNft": "Battalion NFT",
    "navigation.earlyContributors": "Early Contributors",
    "navigation.leaderboard": "Leaderboard",
    "navigation.leaderboardInfo": "Leaderboard Info",
    "navigation.genesisEvent": "Frontiers Event",
    "navigation.contests": "Contests",
  },
  updates: {
    "navigation.news": "News",
    "navigation.awards": "Awards",
    "navigation.roadmap": "Roadmap",
  },
  about: {
    "navigation.aboutOverview": "Overview",
    "navigation.founders": "Founders",
    "navigation.aboutTeam": "Team",
    "navigation.opportunities": "Opportunities",
    "navigation.strategy": "Strategy",
    "navigation.investors": "Investors",
  },
};
