// src/routes/AppRoutes.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { ecosystemAiPath } from "@/config/featureFlags";
import { Suspense, lazy } from "react";
import React from "react";
import PrivateRoute from "./PrivateRoute";
import { Pages, routesV2, pageTitleMaps } from "../config/routesConfig";
import useScrollToTop from "../hooks/useScrollToTop";
import LogoutRouteGate from "./LogoutRouteGate";
import PageLoading from "../components/ui/PageLoading";
import { RouteWithMeta, renderNestedRoutes, renderAdminRoutes } from "./routeHelpers";

// Admin pages (lazy loaded)
const AdminDashboard = lazy(() => import("../features/admin/pages/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const WhitelistManagement = lazy(() => import("../features/admin/pages/WhitelistManagement").then(m => ({ default: m.WhitelistManagement })));
const GovernanceManagement = lazy(() => import("../features/admin/pages/GovernanceManagement").then(m => ({ default: m.GovernanceManagement })));
const CreateProposal = lazy(() => import("../features/admin/pages/CreateProposal").then(m => ({ default: m.CreateProposal })));
const LeaderboardV3Admin = lazy(() => import("../features/admin/pages/LeaderboardV3Admin").then(m => ({ default: m.LeaderboardV3Admin })));
const NftCollectionManagement = lazy(() => import("../features/admin/pages/NftCollectionManagement").then(m => ({ default: m.NftCollectionManagement })));
const UserManagement = lazy(() => import("../features/admin/pages/UserManagement").then(m => ({ default: m.UserManagement })));
const DevnetMetrics = lazy(() => import("../features/admin/pages/DevnetMetrics").then(m => ({ default: m.DevnetMetrics })));
const FeaturedFeedManagement = lazy(() => import("../features/admin/pages/FeaturedFeedManagement").then(m => ({ default: m.FeaturedFeedManagement })));
const AllianceNftAdmin = lazy(() => import("../features/admin/pages/AllianceNftAdmin").then(m => ({ default: m.AllianceNftAdmin })));
const GenesisPassDropAdmin = lazy(() => import("../features/admin/pages/GenesisPassDropAdmin").then(m => ({ default: m.GenesisPassDropAdmin })));
const BugReportAdmin = lazy(() => import("../features/admin/pages/BugReportAdmin").then(m => ({ default: m.BugReportAdmin })));
const CreatorPostsAdmin = lazy(() => import("../features/admin/pages/CreatorPostsAdmin").then(m => ({ default: m.CreatorPostsAdmin })));

// Claim page (lazy loaded, standalone layout)
const ClaimPage = lazy(() => import("../pages/ClaimPage"));

// uju public coming-soon landing — shown at nasun.io/uju from "Enter uju" button
const UjuComingSoonPage = lazy(() => import("../pages/uju/UjuComingSoonPage"));

// Dev/Showcase pages (lazy loaded)
const ComponentShowcasePage = lazy(() => import("../pages/ComponentShowcasePage"));
const WalletTestPage = lazy(() => import("../pages/dev/WalletTestPage"));
const DevBattalionNftPage = lazy(() => import("../pages/dev/DevBattalionNftPage"));
const DevGenesisNftPage = lazy(() => import("../pages/dev/DevGenesisNftPage"));
const DevInvestorsPage = lazy(() => import("../pages/dev/InvestorsPage"));
const DevGenesisPassPage = lazy(() => import("../pages/dev/DevGenesisPassPage"));
const StatsPage = lazy(() => import("../pages/dev/StatsPage"));
// DevHomePage is eager-loaded into the main bundle. It's the actual `/`
// landing page, so on cold loads its lazy chunk fetch blocked Hero mount
// (and video playback) by an extra round-trip. Sibling sections (auth/
// ecosystem/mechanism/etc.) come along for the ride.
import DevHomePageEager from "../pages/dev/DevHomePage";
const DevHomePage = lazy(() => Promise.resolve({ default: DevHomePageEager }));
const DevAboutPage = lazy(() => import("../pages/dev/DevAboutPage"));

// Admin route definitions
const adminRoutes = [
  { path: "/admin", title: "Admin Dashboard", component: AdminDashboard },
  { path: "/admin/whitelist", title: "Allowlist Export", component: WhitelistManagement },
  { path: "/admin/governance", title: "Governance Management", component: GovernanceManagement },
  { path: "/admin/governance/create", title: "Create Proposal", component: CreateProposal },
  { path: "/admin/leaderboard-v3", title: "Leaderboard V3 Admin", component: LeaderboardV3Admin },
  { path: "/admin/users", title: "User Management", component: UserManagement },
  { path: "/admin/nft-collections", title: "NFT Collections", component: NftCollectionManagement },
  { path: "/admin/devnet-metrics", title: "Devnet Metrics", component: DevnetMetrics },
  { path: "/admin/featured-feed", title: "Featured Feed", component: FeaturedFeedManagement },
  { path: "/admin/alliance-nft", title: "Alliance NFT", component: AllianceNftAdmin },
  { path: "/admin/genesis-pass-drop", title: "Genesis Pass Drop", component: GenesisPassDropAdmin },
  { path: "/admin/bug-reports", title: "Bug Reports", component: BugReportAdmin },
  { path: "/admin/creator-posts", title: "Creator Posts", component: CreatorPostsAdmin },
];

const AppRoutes = () => {
  return (
    <>
      <ScrollHandler />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        {/* Auth Routes */}
        <Route path="/callback" element={<Pages.Callback />} />
        <Route
          path="/logout"
          element={
            <LogoutRouteGate>
              <Pages.Logout />
            </LogoutRouteGate>
          }
        />

        {/* Home Route — now serves the new dev/home landing.
            Old home preserved at /archive/home-may2026 for reference. */}
        <Route
          path="/"
          element={<RouteWithMeta route={{ component: DevHomePage, meta: routesV2.home.meta }} />}
        />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route
          path="/archive/home-may2026"
          element={<RouteWithMeta route={{ component: Pages.LegacyHome2026May, meta: { title: "Archive — Home (May 2026) — NASUN", description: "Archived snapshot of the May 2026 Nasun home page." } }} />}
        />

        {/* GenSol archive routes — pre-2026-05-29 design preserved at /archive/ecosystem/gensol/*. */}
        <Route
          path="/archive/ecosystem/gensol/main"
          element={<RouteWithMeta route={{ component: Pages.LegacyGenSolMain, meta: { title: "Archive — GenSol — NASUN", description: "Archived GenSol universe overview." } }} />}
        />
        <Route
          path="/archive/ecosystem/gensol/shooter"
          element={<RouteWithMeta route={{ component: Pages.LegacyGenSolShooter, meta: { title: "Archive — Spectra — NASUN", description: "Archived Spectra shooter page." } }} />}
        />
        <Route
          path="/archive/ecosystem/gensol/animation"
          element={<RouteWithMeta route={{ component: Pages.LegacyGenSolAnimation, meta: { title: "Archive — The Heist — NASUN", description: "Archived The Heist animation page." } }} />}
        />
        <Route
          path="/archive/ecosystem/gensol/plan"
          element={<RouteWithMeta route={{ component: Pages.LegacyGenSolPlan, meta: { title: "Archive — GenSol Plan — NASUN", description: "Archived GenSol transmedia plan." } }} />}
        />

        {/* Dynamic Routes from routesV2 (non-nested) */}
        {Object.entries(routesV2)
          .filter(([key]) => !["home", "ecosystem", "infra", "team", "wave1Campaign", "updates", "network", "about", "community", "leaderboards"].includes(key))
          .map(([key, routeConfig]) => {
            const RouteElement = routeConfig.isProtected ? (
              <PrivateRoute>
                <RouteWithMeta route={routeConfig} />
              </PrivateRoute>
            ) : (
              <RouteWithMeta route={routeConfig} />
            );

            return (
              <Route key={key} path={routeConfig.path} element={RouteElement} />
            );
          })}

        {/* Nested Routes - 7 sections using shared helper */}
        <Route path="/network">
          {renderNestedRoutes("Network", routesV2.network, "nsn", pageTitleMaps.network)}
          <Route path="governance/proposal/:proposalId" element={<Pages.ProposalDetail />} />
        </Route>

        <Route path="/infra">
          {renderNestedRoutes("Infra", routesV2.infra, "overview", pageTitleMaps.infra)}
        </Route>

        <Route path="/ecosystem">
          {renderNestedRoutes("Ecosystem", routesV2.ecosystem, null, pageTitleMaps.ecosystem)}
        </Route>

        <Route path="/team">
          {renderNestedRoutes("Team", routesV2.team, "founders", pageTitleMaps.team)}
        </Route>

        <Route path="/wave1">
          {renderNestedRoutes("Wave 1 Campaign", routesV2.wave1Campaign, "battalion-nft", pageTitleMaps.wave1)}
        </Route>

        <Route path="/updates">
          {renderNestedRoutes("Updates", routesV2.updates, "news", pageTitleMaps.updates)}
        </Route>

        <Route path="/about">
          <Route index element={<DevAboutPage />} />
          <Route path="founders" element={<Pages.Founders />} />
          <Route path="news" element={<Pages.News />} />
          <Route path="awards" element={<Pages.Grants />} />
          <Route path="roadmap" element={<Pages.Roadmap />} />
        </Route>

        <Route path="/community">
          {renderNestedRoutes("Community", routesV2.community, "alliance-nft", pageTitleMaps.community)}
          <Route path="governance/proposal/:proposalId" element={<Pages.ProposalDetail />} />
        </Route>

        <Route path="/leaderboards">
          {renderNestedRoutes("Leaderboards", routesV2.leaderboards, "nasun-ecosystem-leaderboard", pageTitleMaps.leaderboards)}
        </Route>

        {/* Legacy redirects */}
        <Route path="/protocol" element={<Navigate to="/network" replace />} />
        <Route path="/ecosystem/ai-economy" element={<Navigate to={ecosystemAiPath} replace />} />
        <Route path="/ecosystem/finance" element={<Navigate to="/ecosystem/pado" replace />} />
        <Route path="/finance" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/ips" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/ip/gensol/*" element={<Navigate to="/ecosystem/gensol/main" replace />} />
        <Route path="/ip/*" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/nft-event" element={<Navigate to="/wave1/battalion-nft" replace />} />
        <Route path="/roadmap" element={<Navigate to="/about/roadmap" replace />} />
        <Route path="/updates/roadmap" element={<Navigate to="/about/roadmap" replace />} />
        <Route path="/updates/news" element={<Navigate to="/about/news" replace />} />
        <Route path="/opportunities" element={<Navigate to="/about/opportunities" replace />} />
        <Route path="/team/founders" element={<Navigate to="/about/founders" replace />} />
        <Route path="/team/opportunities" element={<Navigate to="/about/opportunities" replace />} />
        <Route path="/vision/strategy" element={<Navigate to="/about/strategy" replace />} />
        <Route path="/updates/awards" element={<Navigate to="/about/awards" replace />} />
        <Route path="/grants" element={<Navigate to="/about/awards" replace />} />
        <Route path="/updates/grants" element={<Navigate to="/about/awards" replace />} />
        <Route path="/wave1/leaderboard" element={<Navigate to="/leaderboards/creators-leaderboard" replace />} />
        <Route path="/wave1/leaderboard-guide" element={<Navigate to="/leaderboards/creators-leaderboard-guide" replace />} />
        <Route path="/wave1/alliance-nft" element={<Navigate to="/community/alliance-nft" replace />} />
        <Route path="/wave1/creators-leaderboard" element={<Navigate to="/leaderboards/creators-leaderboard" replace />} />
        <Route path="/wave1/creators-leaderboard-guide" element={<Navigate to="/leaderboards/creators-leaderboard-guide" replace />} />
        <Route path="/network/governance" element={<Navigate to="/community/governance" replace />} />
        <Route path="/dev/pado-score-leaderboard" element={<Navigate to="/leaderboards/pado-leaderboard" replace />} />
        {/* Legacy /community/*-leaderboard* URLs → /leaderboards/* */}
        <Route path="/community/pado-leaderboard" element={<Navigate to="/leaderboards/pado-leaderboard" replace />} />
        <Route path="/community/pado-score-leaderboard" element={<Navigate to="/leaderboards/pado-leaderboard" replace />} />
        <Route path="/community/nasun-ecosystem-leaderboard" element={<Navigate to="/leaderboards/nasun-ecosystem-leaderboard" replace />} />
        <Route path="/community/creators-leaderboard" element={<Navigate to="/leaderboards/creators-leaderboard" replace />} />
        <Route path="/community/creators-leaderboard-guide" element={<Navigate to="/leaderboards/creators-leaderboard-guide" replace />} />
        <Route path="/ecosystem/leaderboard" element={<Navigate to="/leaderboards/nasun-ecosystem-leaderboard" replace />} />

        {/* Headless WordPress Post Detail Page */}
        <Route path="/awards-grants/:slug" element={<Pages.PostDetailPage />} />

        {/* Admin Routes */}
        {renderAdminRoutes(adminRoutes)}

        {/* uju public coming-soon (any host) — "Enter uju" button target */}
        <Route path="/uju" element={
          <Suspense fallback={<PageLoading />}>
            <UjuComingSoonPage />
          </Suspense>
        } />
        {/* Legacy uju dev path — uju app now lives at /my-account */}
        <Route path="/dev/uju" element={<Navigate to="/my-account" replace />} />

        {/* Claim Route (standalone landing page, no Navbar/Footer) */}
        <Route path="/claim/:encodedData" element={
          <Suspense fallback={<PageLoading />}>
            <ClaimPage />
          </Suspense>
        } />

        {/* Dev/Showcase Routes */}
        <Route path="/showcase" element={<ComponentShowcasePage />} />
        <Route path="/dev/home" element={<Navigate to="/" replace />} />
        <Route path="/dev/about" element={<Navigate to="/about" replace />} />
        <Route path="/dev/wallet-test" element={<WalletTestPage />} />
        <Route path="/dev/stats" element={<StatsPage />} />
        <Route path="/dev/battalion-nft" element={<DevBattalionNftPage />} />
        <Route path="/dev/genesis-nft" element={<DevGenesisNftPage />} />
        <Route path="/dev/investors" element={<DevInvestorsPage />} />
        <Route path="/dev/genesis-pass" element={<DevGenesisPassPage />} />
        {/* /dev/genesis-pass-drop moved to /wave1/genesis-pass-drop */}
        <Route
          path="/legacy/home2026april"
          element={<Pages.LegacyHome2026April />}
        />
        <Route path="/dev/my-account" element={<Navigate to="/archive/my-account" replace />} />
        <Route path="/dev/alliance-nft" element={<Navigate to="/wave1/alliance-nft" replace />} />

        {/* Fallback Route */}
        <Route path="*" element={<Pages.NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
};

export default AppRoutes;

// Scroll handler component
const ScrollHandler = () => {
  useScrollToTop();
  return null;
};
