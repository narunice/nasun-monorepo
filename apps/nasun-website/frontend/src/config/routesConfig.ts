// src/config/routesConfig.ts
import { lazy } from "react";
import { EnhancedRouteConfigBuilder } from "../types/routes.d";
import { TFunction } from "i18next";

// 페이지 컴포넌트 lazy loading
export const Pages = {
  Home: lazy(() => import("../pages/HomePage")),
  VisionStrategy: lazy(() => import("../pages/about/StrategyPage")),
  VisionNetwork: lazy(() => import("../pages/protocol/NetworkPage")),
  IPs: lazy(() => import("../pages/IPsPage")),
  IPsGenSol: lazy(() => import("../pages/ips/gensol/GenSolMainPage")),
  IPsGenSolOverview: lazy(() => import("../pages/ips/gensol/OverviewPage")),
  IPsGenSolShooter: lazy(() => import("../pages/ips/gensol/ShooterPage")),
  IPsGenSolHeist: lazy(() => import("../pages/ips/gensol/HeistPage")),
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

  // Network 섹션 (서브메뉴 있음) - 기존 Protocol에서 변경
  network: {
    path: "/network",
    component: Pages.VisionNetwork, // 기본 서브페이지로 Nasun Network
    navItem: {
      name: "navigation.network",
      path: "/network",
      subMenu: [
        {
          name: "navigation.nasunNetwork",
          path: "/network/nasun",
          element: Pages.VisionNetwork,
        },
        {
          name: "navigation.devnetWallet",
          path: "https://explorer.devnet.nasun.io/",
          external: true,
        },
        {
          name: "navigation.governance",
          path: "/network/governance",
          element: Pages.Web3, // ProposalPage - Nasun Devnet Voting System
        },
        {
          name: "navigation.privacy",
          path: "/network/privacy",
          element: Pages.VisionNetwork, // Placeholder
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.litepaper",
          path: "/network/litepaper", // Placeholder path
          element: Pages.VisionNetwork, // Placeholder
          disabled: true, // Coming Soon
          external: true, // To show external link icon
        },
      ],
    },
    meta: {
      title: "Network - NASUN",
      description: "NASUN Network",
    },
  },

  // Ecosystem 섹션 (서브메뉴 있음) - 기존 Finance에서 변경
  ecosystem: {
    path: "/ecosystem",
    component: Pages.FinancePado, // 기본 서브페이지로 Pado
    navItem: {
      name: "navigation.ecosystem",
      path: "/ecosystem",
      subMenu: [
        {
          name: "navigation.financePado",
          path: "/ecosystem/finance",
          element: Pages.FinancePado,
        },
        {
          name: "navigation.aiEconomy",
          path: "/ecosystem/ai-economy",
          element: Pages.FinancePado, // Placeholder
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.tokenizedAssets",
          path: "/ecosystem/tokenized-assets",
          element: Pages.FinancePado, // Placeholder
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.stablecoinRails",
          path: "/ecosystem/stablecoin-rails",
          element: Pages.FinancePado, // Placeholder
          disabled: true, // Coming Soon
        },
        {
          name: "navigation.depinCompute",
          path: "/ecosystem/depin-compute",
          element: Pages.FinancePado, // Placeholder
          disabled: true, // Coming Soon
        },
      ],
    },
    meta: {
      title: "Ecosystem - NASUN",
      description: "NASUN Ecosystem - The Pado Initiative",
    },
  },

  // IP 섹션 (서브메뉴 있음)
  ip: {
    path: "/ip",
    component: Pages.IPs,
    navItem: {
      name: "navigation.ip",
      path: "/ip",
      subMenu: [
        {
          name: "navigation.genSol",
          path: "/ip/gensol",
          element: Pages.IPsGenSol,
          subMenu: [
            {
              name: "navigation.genSolMain",
              path: "/ip/gensol/main",
              element: Pages.IPsGenSol,
            },
            {
              name: "navigation.genSolShooter",
              path: "/ip/gensol/shooter",
              element: Pages.IPsGenSolShooter,
            },
            {
              name: "navigation.genSolAnimation",
              path: "/ip/gensol/animation",
              element: Pages.IPsGenSolHeist,
            },
            {
              name: "navigation.genSolPlan",
              path: "/ip/gensol/plan",
              element: Pages.IPsGenSolOverview,
            },
          ],
        },
        {
          name: "navigation.riderStudio",
          path: "/ip/riderstudio",
          element: Pages.IPsRiderStudioMain,
          subMenu: [
            {
              name: "navigation.riderStudioMain",
              path: "/ip/riderstudio/main",
              element: Pages.IPsRiderStudioMain,
            },
            {
              name: "navigation.riderStudioFramework",
              path: "/ip/riderstudio/framework",
              element: Pages.IPsRiderStudioOverview,
            },
          ],
        },
        {
          name: "navigation.wePop",
          path: "/ip/wepop",
          element: Pages.IPsWePop,
          disabled: true, // Coming Soon
        },
      ],
    },
    meta: {
      title: "IP - NASUN",
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
          name: "navigation.opportunities",
          path: "/about/opportunities",
          element: Pages.Opportunities,
        },
        {
          name: "navigation.strategy",
          path: "/about/strategy",
          element: Pages.VisionStrategy,
        },
        {
          name: "navigation.aboutTeam",
          path: "/about/team",
          element: Pages.AboutTeam,
          disabled: true, // Coming Soon
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
          name: "navigation.leaderboard",
          path: "/wave1/leaderboard",
          element: Pages.Leaderboard,
        },
        {
          name: "navigation.genesisNft",
          path: "/wave1/genesis-nft",
          element: Pages.GenesisNft,
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
    path: "/wave1/genesis-nft",
    component: Pages.GenesisNft,
    navItem: {
      name: "navigation.genesisNft",
      path: "/wave1/genesis-nft",
      hidden: true,
    },
    meta: {
      title: "Genesis NFT - NASUN",
      description: "NASUN Genesis NFT collection",
    },
  },

  leaderboard: {
    path: "/wave1/leaderboard",
    component: Pages.Leaderboard,
    navItem: {
      name: "navigation.leaderboard",
      path: "/wave1/leaderboard",
      hidden: true,
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
      // 정렬 순서: network, ecosystem, ip, updates, about, team, wave1, leaderboard, genesis-nft
      const order = [
        "network",
        "ecosystem",
        "ip",
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
