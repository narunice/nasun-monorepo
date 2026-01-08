// src/config/routesConfig.ts
import { lazy } from "react";
import { EnhancedRouteConfigBuilder } from "../types/routes.d";
import { TFunction } from "i18next";

// 페이지 컴포넌트 lazy loading
export const Pages = {
  Home: lazy(() => import("../pages/HomePage")),
  VisionStrategy: lazy(() => import("../pages/about/StrategyPage")),
  VisionProducts: lazy(() => import("../pages/_legacy/ProductsPage")),
  VisionWeb3: lazy(() => import("../pages/_legacy/Web3Page")),
  VisionNetwork: lazy(() => import("../pages/protocol/NetworkPage")),
  VisionManifesto: lazy(() => import("../pages/_legacy/ManifestoPage")),
  VisionStory: lazy(() => import("../pages/_legacy/StoryPage")),
  IPs: lazy(() => import("../pages/IPsPage")),
  IPsGenSol: lazy(() => import("../pages/ips/gensol/GenSolMainPage")),
  IPsGenSolOverview: lazy(() => import("../pages/ips/gensol/OverviewPage")),
  IPsGenSolSpectra: lazy(() => import("../pages/ips/gensol/SpectraPage")),
  IPsGenSolSpectraHeist: lazy(() => import("../pages/ips/gensol/SpectraHeistPage")),
  FinancePado: lazy(() => import("../pages/finance/PadoPage")),
  IPsWePop: lazy(() => import("../pages/ips/WePopPage")),
  IPsRiderStudioMain: lazy(() => import("../pages/ips/riderstudio/RiderStudioMainPage")),
  IPsRiderStudioOverview: lazy(() => import("../pages/ips/riderstudio/RiderStudioOverviewPage")),
  Roadmap: lazy(() => import("../pages/RoadmapPage")),
  Opportunities: lazy(() => import("../pages/about/OpportunitiesPage")),
  Grants: lazy(() => import("../pages/AwardsPage")),
  Founders: lazy(() => import("../pages/about/FoundersPage")),
  GenesisNft: lazy(() => import("../pages/GenesisNftPage")),
  Web3: lazy(() => import("../pages/protocol/ProposalPage")),
  MyAccountPage: lazy(() => import("../pages/MyAccountPage")),
  PrivacyPolicy: lazy(() => import("../pages/PrivacyPolicyPage")),
  TermsOfUse: lazy(() => import("../pages/TermsOfUsePage")),
  PostDetailPage: lazy(() => import("../pages/PostDetailPage")), // Headless WP Post Page
  News: lazy(() => import("../pages/NewsPage")),
  Callback: lazy(() => import("@/features/auth").then(module => ({ default: module.Callback }))),
  Logout: lazy(() => import("../pages/LogoutPage")),
  Leaderboard: lazy(() => import("../pages/LeaderboardPage")),
  XLeaderboard: lazy(() => import("../pages/LeaderboardPage")), // backward compatibility
  // Wave 1 Campaign Pages
  BattalionNft: lazy(() => import("../pages/wave1/BattalionNftPage")),
  EarlyContributors: lazy(() => import("../pages/wave1/EarlyContributorsPage")),
  LeaderboardInfo: lazy(() => import("../pages/wave1/LeaderboardInfoPage")),
  // Protocol Pages
  ProtocolOverview: lazy(() => import("../pages/protocol/ProtocolOverviewPage")),
  // About Pages
  About: lazy(() => import("../pages/AboutPage")),
  AboutTeam: lazy(() => import("../pages/about/TeamPage")),
  // 404 Page
  NotFound: lazy(() => import("../pages/NotFoundPage")),
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

  // Protocol 섹션 (서브메뉴 있음)
  protocol: {
    path: "/protocol",
    component: Pages.VisionNetwork, // 기본 서브페이지로 Nasun Network
    navItem: {
      name: "navigation.protocol",
      path: "/protocol",
      subMenu: [
        {
          name: "navigation.nasunNetwork",
          path: "/protocol/network",
          element: Pages.VisionNetwork,
        },
        {
          name: "navigation.devnetWallet",
          path: "https://explorer.devnet.nasun.io/",
          external: true,
        },
        {
          name: "navigation.governance",
          path: "/protocol/governance",
          element: Pages.Web3, // ProposalPage - Nasun Devnet Voting System
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.protocolOverview",
          path: "/protocol/overview",
          element: Pages.ProtocolOverview,
        },
      ],
    },
    meta: {
      title: "Protocol - NASUN",
      description: "NASUN Protocol",
    },
  },

  // Finance 섹션 (서브메뉴 있음) - 기존 Vision에서 이름 변경
  finance: {
    path: "/finance",
    component: Pages.FinancePado, // 기본 서브페이지로 Pado
    navItem: {
      name: "navigation.finance",
      path: "/finance",
      subMenu: [
        {
          name: "navigation.pado",
          path: "/finance/pado",
          element: Pages.FinancePado,
          subMenu: [
            {
              name: "navigation.padoMain",
              path: "/finance/pado/main",
              element: Pages.FinancePado,
            },
            {
              name: "navigation.padoSpotPerps",
              path: "/finance/pado/spot-perps",
              element: Pages.FinancePado, // Placeholder
              disabled: true, // Coming Soon
            },
            {
              name: "navigation.padoPrediction",
              path: "/finance/pado/prediction",
              element: Pages.FinancePado, // Placeholder
              disabled: true, // Coming Soon
            },
            {
              name: "navigation.padoLending",
              path: "/finance/pado/lending",
              element: Pages.FinancePado, // Placeholder
              disabled: true, // Coming Soon
            },
            {
              name: "navigation.padoTokenization",
              path: "/finance/pado/tokenization",
              element: Pages.FinancePado, // Placeholder
              disabled: true, // Coming Soon
            },
            {
              name: "navigation.padoStablecoins",
              path: "/finance/pado/stablecoins",
              element: Pages.FinancePado, // Placeholder
              disabled: true, // Coming Soon
            },
          ],
        },
      ],
    },
    meta: {
      title: "Finance - NASUN",
      description: "NASUN Finance - The Pado Initiative",
    },
  },

  // IPs 섹션 (서브메뉴 있음)
  ips: {
    path: "/ips",
    component: Pages.IPs,
    navItem: {
      name: "navigation.ips",
      path: "/ips",
      subMenu: [
        {
          name: "navigation.genSol",
          path: "/ips/gensol",
          element: Pages.IPsGenSol,
          subMenu: [
            {
              name: "navigation.genSolMain",
              path: "/ips/gensol/main",
              element: Pages.IPsGenSol,
            },
            {
              name: "navigation.genSolShooter",
              path: "/ips/gensol/shooter",
              element: Pages.IPsGenSolSpectra,
            },
            {
              name: "navigation.genSolAnimation",
              path: "/ips/gensol/animation",
              element: Pages.IPsGenSolSpectraHeist,
            },
            {
              name: "navigation.genSolOverview",
              path: "/ips/gensol/overview",
              element: Pages.IPsGenSolOverview,
            },
          ],
        },
        {
          name: "navigation.riderStudio",
          path: "/ips/riderstudio",
          element: Pages.IPsRiderStudioMain,
          subMenu: [
            {
              name: "navigation.riderStudioMain",
              path: "/ips/riderstudio/main",
              element: Pages.IPsRiderStudioMain,
            },
            {
              name: "navigation.riderStudioOverview",
              path: "/ips/riderstudio/overview",
              element: Pages.IPsRiderStudioOverview,
            },
          ],
        },
        {
          name: "navigation.wePop",
          path: "/ips/wepop",
          element: Pages.IPsWePop,
          disabled: true, // Coming Soon
        },
      ],
    },
    meta: {
      title: "IPs - NASUN",
      description: "NASUN intellectual properties",
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
    component: Pages.Founders, // 기본 서브페이지로 Founders
    navItem: {
      name: "navigation.about",
      path: "/about",
      subMenu: [
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
        },
        {
          name: "navigation.strategy",
          path: "/about/strategy",
          element: Pages.VisionStrategy,
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
          name: "navigation.leaderboardInfo",
          path: "/wave1/leaderboard-info",
          element: Pages.LeaderboardInfo,
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
    path: "/genesis-nft",
    component: Pages.GenesisNft,
    navItem: {
      name: "navigation.genesisNft",
      path: "/genesis-nft",
    },
    meta: {
      title: "Genesis NFT - NASUN",
      description: "NASUN Genesis NFT collection",
    },
  },

  leaderboard: {
    path: "/leaderboard",
    component: Pages.Leaderboard,
    navItem: {
      name: "navigation.leaderboard",
      path: "/leaderboard",
    },
    meta: {
      title: "Leaderboard - NASUN",
      description: "Engagement leaderboard",
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
      // 정렬 순서: protocol, ips, finance, updates, about, team, wave1, leaderboard, genesis-nft
      const order = [
        "protocol",
        "ips",
        "finance",
        "updates",
        "about",
        "team",
        "wave1",
        "leaderboard",
        "genesis-nft",
      ];
      const aIndex = order.findIndex((item) => a.path.includes(item));
      const bIndex = order.findIndex((item) => b.path.includes(item));
      return aIndex - bIndex;
    });
};
