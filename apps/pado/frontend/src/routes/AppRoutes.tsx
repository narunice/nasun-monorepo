/**
 * AppRoutes
 * Application route definitions with lazy-loaded pages.
 *
 * Navigation Structure:
 * Desktop: Spot | Perpetuals | Predict | Earn | Social v (Leaderboard, Competitions) | Portfolio
 * Mobile:  Home | Spot | Predict | Social | More (Perpetuals, Earn, Portfolio, Wallet)
 * - Wallet (/wallet) - accessible via header button (desktop) or More sheet (mobile)
 * - Admin (/admin) - conditional, admin-only
 */

import { lazy, Suspense, type ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PageSpinner } from '../components/common/PageSpinner';
import { hasAccess, type AccessMode } from '../config/network';
import { useAppAdmin } from '../hooks/useAppAdmin';

// Retry dynamic import once on chunk load failure (stale cache after deploy).
// On failure, reload the page to fetch the new index.html + chunks.
function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      // Prevent infinite reload loops: only reload once per session
      const key = 'chunk-reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
      // Return a never-resolving promise to prevent React from rendering stale module
      return new Promise(() => {});
    }),
  );
}

// Progressive feature gate: block routes below the required access level
// Platform admins bypass all gates
function GatedRoute({ requires, children }: { requires: AccessMode; children: React.ReactNode }) {
  const isAppAdmin = useAppAdmin();
  if (!isAppAdmin && !hasAccess(requires)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// Eager: landing page and auth redirect (must load immediately)
import { HomePage } from '../pages/HomePage';
import { AuthCallbackPage } from '../pages/AuthCallbackPage';
import { PredictPasswordGate } from '../components/common/PredictPasswordGate';

// Lazy: all other pages loaded on demand
const TradePage = lazyWithRetry(() => import('../pages/TradePage').then(m => ({ default: m.TradePage })));
const PerpTradePage = lazyWithRetry(() => import('../pages/PerpTradePage').then(m => ({ default: m.PerpTradePage })));
const WalletPage = lazyWithRetry(() => import('../pages/WalletPage').then(m => ({ default: m.WalletPage })));
const PredictPage = lazyWithRetry(() => import('../pages/PredictPage').then(m => ({ default: m.PredictPage })));
const PredictMarketPage = lazyWithRetry(() => import('../pages/PredictMarketPage').then(m => ({ default: m.PredictMarketPage })));
const IdeaSubmissionPage = lazyWithRetry(() => import('../pages/IdeaSubmissionPage').then(m => ({ default: m.IdeaSubmissionPage })));
const AdminPage = lazyWithRetry(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));
const LeaderboardPage = lazyWithRetry(() => import('../pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const TraderProfilePage = lazyWithRetry(() => import('../pages/TraderProfilePage').then(m => ({ default: m.TraderProfilePage })));
const CompetitionsPage = lazyWithRetry(() => import('../pages/CompetitionsPage').then(m => ({ default: m.CompetitionsPage })));
const CompetitionDetailPage = lazyWithRetry(() => import('../pages/CompetitionDetailPage').then(m => ({ default: m.CompetitionDetailPage })));
const EarnPage = lazyWithRetry(() => import('../pages/EarnPage').then(m => ({ default: m.EarnPage })));
const PortfolioPage = lazyWithRetry(() => import('../pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const RecoverPage = lazyWithRetry(() => import('../pages/RecoverPage').then(m => ({ default: m.RecoverPage })));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        {/* Home (Dashboard) */}
        <Route path="/" element={<HomePage />} />

        {/* Spot & Perpetuals (top-level) */}
        <Route path="/spot" element={<GatedRoute requires="spot"><TradePage /></GatedRoute>} />
        <Route path="/perpetuals" element={<GatedRoute requires="full"><PerpTradePage /></GatedRoute>} />

        {/* Legacy /markets/* and /trade redirects */}
        <Route path="/markets" element={<Navigate to="/spot" replace />} />
        <Route path="/markets/spot" element={<Navigate to="/spot" replace />} />
        <Route path="/markets/perp" element={<Navigate to="/perpetuals" replace />} />
        <Route path="/trade" element={<Navigate to="/spot" replace />} />
        <Route path="/trade/spot" element={<Navigate to="/spot" replace />} />
        <Route path="/trade/perp" element={<Navigate to="/perpetuals" replace />} />

        {/* Wallet (Send/Receive) */}
        <Route path="/wallet" element={<GatedRoute requires="spot"><WalletPage /></GatedRoute>} />

        {/* Prediction Markets — password-gated */}
        <Route path="/predict" element={<PredictPasswordGate><PredictPage /></PredictPasswordGate>} />
        <Route path="/predict/markets" element={<Navigate to="/predict" replace />} />
        <Route path="/predict/:marketId" element={<PredictPasswordGate><PredictMarketPage /></PredictPasswordGate>} />

        {/* Legacy /games/* — archived, redirect home */}
        <Route path="/games/*" element={<Navigate to="/" replace />} />
        <Route path="/lottery" element={<Navigate to="/" replace />} />
        <Route path="/scratch" element={<Navigate to="/" replace />} />
        <Route path="/numbermatch" element={<Navigate to="/" replace />} />
        <Route path="/leisure/*" element={<Navigate to="/" replace />} />

        {/* Admin (Unified Dashboard) - AdminCap guard already exists */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Leaderboard */}
        <Route path="/leaderboard" element={<GatedRoute requires="spot"><LeaderboardPage /></GatedRoute>} />
        <Route path="/leaderboard/trader/:address" element={<GatedRoute requires="spot"><TraderProfilePage /></GatedRoute>} />

        {/* Competitions */}
        <Route path="/competitions" element={<GatedRoute requires="full"><CompetitionsPage /></GatedRoute>} />
        <Route path="/competitions/:id" element={<GatedRoute requires="full"><CompetitionDetailPage /></GatedRoute>} />

        {/* Earn (Staking + Lending) */}
        <Route path="/earn" element={<GatedRoute requires="full"><EarnPage /></GatedRoute>} />

        {/* Portfolio */}
        <Route path="/portfolio" element={<GatedRoute requires="spot"><PortfolioPage /></GatedRoute>} />

        {/* Asset Recovery (escape hatch) - no GatedRoute: must be reachable
            even when other gates fail, since recovery should always work. */}
        <Route path="/recover" element={<RecoverPage />} />

        {/* Auth (zkLogin callback) - whitelisted */}
        <Route path="/callback" element={<AuthCallbackPage />} />

        {/* Fallback */}
        <Route path="*" element={<GatedRoute requires="spot"><Navigate to="/" replace /></GatedRoute>} />
      </Routes>
    </Suspense>
  );
}
