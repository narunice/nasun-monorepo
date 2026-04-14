/**
 * AppRoutes
 * Application route definitions with lazy-loaded pages.
 *
 * Navigation Structure (Menu Restructure v3):
 * Desktop: Trade v (Spot, Perp) | Predict | Lottery | Earn | Social v (Leaderboard, Competitions) | Portfolio
 * Mobile:  Home | Trade | Predict | Social | More (Lottery, Earn, Perp, Portfolio, Wallet)
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
    return <Navigate to="/games/lottery" replace />;
  }
  return <>{children}</>;
}

// Eager: landing page and auth redirect (must load immediately)
import { HomePage } from '../pages/HomePage';
import { AuthCallbackPage } from '../pages/AuthCallbackPage';

// Lazy: all other pages loaded on demand
const TradePage = lazyWithRetry(() => import('../pages/TradePage').then(m => ({ default: m.TradePage })));
const PerpTradePage = lazyWithRetry(() => import('../pages/PerpTradePage').then(m => ({ default: m.PerpTradePage })));
const WalletPage = lazyWithRetry(() => import('../pages/WalletPage').then(m => ({ default: m.WalletPage })));
const PredictPage = lazyWithRetry(() => import('../pages/PredictPage').then(m => ({ default: m.PredictPage })));
const PredictMarketPage = lazyWithRetry(() => import('../pages/PredictMarketPage').then(m => ({ default: m.PredictMarketPage })));
const IdeaSubmissionPage = lazyWithRetry(() => import('../pages/IdeaSubmissionPage').then(m => ({ default: m.IdeaSubmissionPage })));
const LotteryPage = lazyWithRetry(() => import('../pages/LotteryPage').then(m => ({ default: m.LotteryPage })));
const LotteryRoundPage = lazyWithRetry(() => import('../pages/LotteryRoundPage').then(m => ({ default: m.LotteryRoundPage })));
const AdminPage = lazyWithRetry(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));
const LeaderboardPage = lazyWithRetry(() => import('../pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const TraderProfilePage = lazyWithRetry(() => import('../pages/TraderProfilePage').then(m => ({ default: m.TraderProfilePage })));
const CompetitionsPage = lazyWithRetry(() => import('../pages/CompetitionsPage').then(m => ({ default: m.CompetitionsPage })));
const CompetitionDetailPage = lazyWithRetry(() => import('../pages/CompetitionDetailPage').then(m => ({ default: m.CompetitionDetailPage })));
const ScratchCardPage = lazyWithRetry(() => import('../pages/ScratchCardPage').then(m => ({ default: m.ScratchCardPage })));
const NumberMatchPage = lazyWithRetry(() => import('../pages/NumberMatchPage').then(m => ({ default: m.NumberMatchPage })));
const GameHistoryPage = lazyWithRetry(() => import('../pages/GameHistoryPage').then(m => ({ default: m.GameHistoryPage })));
const EarnPage = lazyWithRetry(() => import('../pages/EarnPage').then(m => ({ default: m.EarnPage })));
const PortfolioPage = lazyWithRetry(() => import('../pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        {/* Home (Dashboard) */}
        <Route path="/" element={<HomePage />} />

        {/* Markets */}
        <Route path="/markets" element={<Navigate to="/markets/spot" replace />} />
        <Route path="/markets/spot" element={<GatedRoute requires="spot"><TradePage /></GatedRoute>} />
        <Route path="/markets/perp" element={<GatedRoute requires="full"><PerpTradePage /></GatedRoute>} />

        {/* Wallet (Send/Receive) */}
        <Route path="/wallet" element={<GatedRoute requires="spot"><WalletPage /></GatedRoute>} />

        {/* Prediction Markets
            NOTE: While VITE_IDEA_SUBMISSION_ENABLED is true, /predict is temporarily
            repurposed as an Ideas & Feedback submission form (pre-launch data
            collection). The real PredictPage lives behind GatedRoute as before.
            Flip the env flag back to false to restore the market listing. */}
        {import.meta.env.VITE_IDEA_SUBMISSION_ENABLED === 'true' ? (
          <Route path="/predict" element={<IdeaSubmissionPage />} />
        ) : (
          <Route path="/predict" element={<GatedRoute requires="full"><PredictPage /></GatedRoute>} />
        )}
        <Route path="/predict/:marketId" element={<GatedRoute requires="full"><PredictMarketPage /></GatedRoute>} />

        {/* Games (Lottery + Scratch Cards + Number Match) - always public */}
        <Route path="/games/lottery" element={<LotteryPage />} />
        <Route path="/games/lottery/:roundId" element={<LotteryRoundPage />} />
        <Route path="/games/scratch" element={<ScratchCardPage />} />
        <Route path="/games/numbermatch" element={<NumberMatchPage />} />
        <Route path="/games/history" element={<GameHistoryPage />} />
        {/* Redirect old paths */}
        <Route path="/lottery" element={<Navigate to="/games/lottery" replace />} />
        <Route path="/scratch" element={<Navigate to="/games/scratch" replace />} />
        <Route path="/numbermatch" element={<Navigate to="/games/numbermatch" replace />} />
        <Route path="/leisure/*" element={<Navigate to="/games/lottery" replace />} />

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

        {/* Auth (zkLogin callback) - whitelisted */}
        <Route path="/callback" element={<AuthCallbackPage />} />

        {/* Fallback */}
        <Route path="*" element={<GatedRoute requires="spot"><Navigate to="/" replace /></GatedRoute>} />
      </Routes>
    </Suspense>
  );
}
