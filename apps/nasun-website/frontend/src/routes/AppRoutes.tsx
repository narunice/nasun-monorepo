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
const BlacklistManagement = lazy(() => import("../features/admin/pages/BlacklistManagement").then(m => ({ default: m.BlacklistManagement })));
const NftCollectionManagement = lazy(() => import("../features/admin/pages/NftCollectionManagement").then(m => ({ default: m.NftCollectionManagement })));

// Dev/Showcase pages (lazy loaded)
const ComponentShowcasePage = lazy(() => import("../pages/ComponentShowcasePage"));
const WalletTestPage = lazy(() => import("../pages/dev/WalletTestPage"));

// Admin route definitions
const adminRoutes = [
  { path: "/admin", title: "Admin Dashboard", component: AdminDashboard },
  { path: "/admin/whitelist", title: "Whitelist Export", component: WhitelistManagement },
  { path: "/admin/governance", title: "Governance Management", component: GovernanceManagement },
  { path: "/admin/governance/create", title: "Create Proposal", component: CreateProposal },
  { path: "/admin/leaderboard-v3", title: "Leaderboard V3 Admin", component: LeaderboardV3Admin },
  { path: "/admin/users", title: "Blacklist Management", component: BlacklistManagement },
  { path: "/admin/nft-collections", title: "NFT Collections", component: NftCollectionManagement },
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
          .filter(([key]) => !["home", "ecosystem", "infra", "team", "wave1Campaign", "updates", "network", "about"].includes(key))
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

        {/* Legacy redirects */}
        <Route path="/protocol" element={<Navigate to="/network" replace />} />
        <Route path="/ecosystem/ai-economy" element={<Navigate to="/ecosystem/baram" replace />} />
        <Route path="/ecosystem/finance" element={<Navigate to="/ecosystem/pado" replace />} />
        <Route path="/finance" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/ips" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/ip/gensol/*" element={<Navigate to="/ecosystem/gensol/main" replace />} />
        <Route path="/ip/*" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/nft-event" element={<Navigate to="/wave1/battalion-nft" replace />} />
        <Route path="/roadmap" element={<Navigate to="/updates/roadmap" replace />} />
        <Route path="/opportunities" element={<Navigate to="/about/opportunities" replace />} />
        <Route path="/team/founders" element={<Navigate to="/about/founders" replace />} />
        <Route path="/team/opportunities" element={<Navigate to="/about/opportunities" replace />} />
        <Route path="/vision/strategy" element={<Navigate to="/about/strategy" replace />} />
        <Route path="/grants" element={<Navigate to="/updates/awards" replace />} />
        <Route path="/updates/grants" element={<Navigate to="/updates/awards" replace />} />

        {/* Headless WordPress Post Detail Page */}
        <Route path="/awards-grants/:slug" element={<Pages.PostDetailPage />} />

        {/* Admin Routes */}
        {renderAdminRoutes(adminRoutes)}

        {/* Dev/Showcase Routes */}
        <Route path="/showcase" element={<ComponentShowcasePage />} />
        <Route path="/dev/wallet-test" element={<WalletTestPage />} />

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
