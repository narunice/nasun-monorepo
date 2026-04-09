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

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PageSpinner } from '../components/common/PageSpinner';
import { hasAccess, type AccessMode } from '../config/network';
import { useAppAdmin } from '../hooks/useAppAdmin';

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
const TradePage = lazy(() => import('../pages/TradePage').then(m => ({ default: m.TradePage })));
const PerpTradePage = lazy(() => import('../pages/PerpTradePage').then(m => ({ default: m.PerpTradePage })));
const WalletPage = lazy(() => import('../pages/WalletPage').then(m => ({ default: m.WalletPage })));
const PredictPage = lazy(() => import('../pages/PredictPage').then(m => ({ default: m.PredictPage })));
const PredictMarketPage = lazy(() => import('../pages/PredictMarketPage').then(m => ({ default: m.PredictMarketPage })));
const LotteryPage = lazy(() => import('../pages/LotteryPage').then(m => ({ default: m.LotteryPage })));
const LotteryRoundPage = lazy(() => import('../pages/LotteryRoundPage').then(m => ({ default: m.LotteryRoundPage })));
const AdminPage = lazy(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));
const LeaderboardPage = lazy(() => import('../pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const TraderProfilePage = lazy(() => import('../pages/TraderProfilePage').then(m => ({ default: m.TraderProfilePage })));
const CompetitionsPage = lazy(() => import('../pages/CompetitionsPage').then(m => ({ default: m.CompetitionsPage })));
const CompetitionDetailPage = lazy(() => import('../pages/CompetitionDetailPage').then(m => ({ default: m.CompetitionDetailPage })));
const ScratchCardPage = lazy(() => import('../pages/ScratchCardPage').then(m => ({ default: m.ScratchCardPage })));
const NumberMatchPage = lazy(() => import('../pages/NumberMatchPage').then(m => ({ default: m.NumberMatchPage })));
const GameHistoryPage = lazy(() => import('../pages/GameHistoryPage').then(m => ({ default: m.GameHistoryPage })));
const EarnPage = lazy(() => import('../pages/EarnPage').then(m => ({ default: m.EarnPage })));
const PortfolioPage = lazy(() => import('../pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));

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

        {/* Prediction Markets */}
        <Route path="/predict" element={<GatedRoute requires="full"><PredictPage /></GatedRoute>} />
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
