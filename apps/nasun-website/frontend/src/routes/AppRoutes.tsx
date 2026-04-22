// src/routes/AppRoutes.tsx
import { Routes, Route, Navigate } from "react-router-dom";
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
const ActivityPointsAdmin = lazy(() => import("../features/admin/pages/ActivityPointsAdmin").then(m => ({ default: m.ActivityPointsAdmin })));
const AirdropAdmin = lazy(() => import("../features/admin/pages/AirdropAdmin").then(m => ({ default: m.AirdropAdmin })));
const AllianceNftAdmin = lazy(() => import("../features/admin/pages/AllianceNftAdmin").then(m => ({ default: m.AllianceNftAdmin })));
const GenesisPassDropAdmin = lazy(() => import("../features/admin/pages/GenesisPassDropAdmin").then(m => ({ default: m.GenesisPassDropAdmin })));
const BugReportAdmin = lazy(() => import("../features/admin/pages/BugReportAdmin").then(m => ({ default: m.BugReportAdmin })));
const CreatorPostsAdmin = lazy(() => import("../features/admin/pages/CreatorPostsAdmin").then(m => ({ default: m.CreatorPostsAdmin })));

// Claim page (lazy loaded, standalone layout)
const ClaimPage = lazy(() => import("../pages/ClaimPage"));

// uju dashboard (lazy loaded, protected)
const UjuPage = lazy(() => import("../pages/uju/UjuPage"));

// Dev/Showcase pages (lazy loaded)
const ComponentShowcasePage = lazy(() => import("../pages/ComponentShowcasePage"));
const WalletTestPage = lazy(() => import("../pages/dev/WalletTestPage"));
const DevBattalionNftPage = lazy(() => import("../pages/dev/DevBattalionNftPage"));
const DevGenesisNftPage = lazy(() => import("../pages/dev/DevGenesisNftPage"));
const DevInvestorsPage = lazy(() => import("../pages/dev/InvestorsPage"));
const DevGenesisPassPage = lazy(() => import("../pages/dev/DevGenesisPassPage"));
const DevHomePage = lazy(() => import("../pages/dev/DevHomePage"));
const StatsPage = lazy(() => import("../pages/dev/StatsPage"));
const NftDropPage = lazy(() => import("../pages/wave1/NftDropPage"));

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
  { path: "/admin/points", title: "Ecosystem Points", component: ActivityPointsAdmin },
  { path: "/admin/airdrop", title: "Airdrop Management", component: AirdropAdmin },
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

        {/* Home Route */}
        <Route path="/" element={<RouteWithMeta route={routesV2.home} />} />
        <Route path="/home" element={<Navigate to="/" replace />} />

        {/* Dynamic Routes from routesV2 (non-nested) */}
        {Object.entries(routesV2)
          .filter(([key]) => !["home", "ecosystem", "infra", "team", "wave1Campaign", "updates", "network", "about", "community"].includes(key))
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
          {renderNestedRoutes("About", routesV2.about, "overview", pageTitleMaps.about)}
        </Route>

        <Route path="/community">
          {renderNestedRoutes("Community", routesV2.community, "alliance-nft", pageTitleMaps.community)}
          <Route path="governance/proposal/:proposalId" element={<Pages.ProposalDetail />} />
        </Route>

        {/* Legacy redirects */}
        <Route path="/protocol" element={<Navigate to="/network" replace />} />
        <Route path="/ecosystem/ai-economy" element={<Navigate to="/ecosystem/baram" replace />} />
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
        <Route path="/updates/awards" element={<Navigate to="/about/news" replace />} />
        <Route path="/grants" element={<Navigate to="/about/news" replace />} />
        <Route path="/updates/grants" element={<Navigate to="/about/news" replace />} />
        <Route path="/wave1/leaderboard" element={<Navigate to="/community/creators-leaderboard" replace />} />
        <Route path="/wave1/leaderboard-guide" element={<Navigate to="/community/creators-leaderboard-guide" replace />} />
        <Route path="/wave1/alliance-nft" element={<Navigate to="/community/alliance-nft" replace />} />
        <Route path="/wave1/creators-leaderboard" element={<Navigate to="/community/creators-leaderboard" replace />} />
        <Route path="/wave1/creators-leaderboard-guide" element={<Navigate to="/community/creators-leaderboard-guide" replace />} />
        <Route path="/network/governance" element={<Navigate to="/community/governance" replace />} />
        <Route path="/dev/pado-score-leaderboard" element={<Navigate to="/community/pado-leaderboard" replace />} />
        <Route path="/community/pado-score-leaderboard" element={<Navigate to="/community/pado-leaderboard" replace />} />
        <Route path="/ecosystem/leaderboard" element={<Navigate to="/community/nasun-ecosystem-leaderboard" replace />} />

        {/* Headless WordPress Post Detail Page */}
        <Route path="/awards-grants/:slug" element={<Pages.PostDetailPage />} />

        {/* Admin Routes */}
        {renderAdminRoutes(adminRoutes)}

        {/* uju dashboard (protected) */}
        <Route path="/uju" element={
          <PrivateRoute>
            <Suspense fallback={<PageLoading />}>
              <UjuPage />
            </Suspense>
          </PrivateRoute>
        } />

        {/* Claim Route (standalone landing page, no Navbar/Footer) */}
        <Route path="/claim/:encodedData" element={
          <Suspense fallback={<PageLoading />}>
            <ClaimPage />
          </Suspense>
        } />

        {/* Dev/Showcase Routes */}
        <Route path="/showcase" element={<ComponentShowcasePage />} />
        <Route path="/dev/wallet-test" element={<WalletTestPage />} />
        <Route path="/dev/stats" element={<StatsPage />} />
        <Route path="/dev/battalion-nft" element={<DevBattalionNftPage />} />
        <Route path="/dev/genesis-nft" element={<DevGenesisNftPage />} />
        <Route path="/dev/investors" element={<DevInvestorsPage />} />
        <Route path="/dev/genesis-pass" element={<DevGenesisPassPage />} />
        {/* /dev/genesis-pass-drop moved to /wave1/genesis-pass-drop */}
        <Route path="/dev/home" element={<DevHomePage />} />
        <Route path="/dev/my-account" element={<Navigate to="/my-account" replace />} />
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
