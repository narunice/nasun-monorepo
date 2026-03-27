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
        <Route path="/markets/spot" element={<TradePage />} />
        <Route path="/markets/perp" element={<PerpTradePage />} />

        {/* Wallet (Send/Receive) */}
        <Route path="/wallet" element={<WalletPage />} />

        {/* Prediction Markets */}
        <Route path="/predict" element={<PredictPage />} />
        <Route path="/predict/:marketId" element={<PredictMarketPage />} />

        {/* Lottery */}
        <Route path="/lottery" element={<LotteryPage />} />
        <Route path="/lottery/:roundId" element={<LotteryRoundPage />} />

        {/* Scratch Cards */}
        <Route path="/scratch" element={<ScratchCardPage />} />

        {/* Admin (Unified Dashboard) */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Leaderboard */}
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/leaderboard/trader/:address" element={<TraderProfilePage />} />

        {/* Competitions */}
        <Route path="/competitions" element={<CompetitionsPage />} />
        <Route path="/competitions/:id" element={<CompetitionDetailPage />} />

        {/* Earn (Staking + Lending) */}
        <Route path="/earn" element={<EarnPage />} />

        {/* Portfolio */}
        <Route path="/portfolio" element={<PortfolioPage />} />

        {/* Auth (zkLogin callback) */}
        <Route path="/callback" element={<AuthCallbackPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
