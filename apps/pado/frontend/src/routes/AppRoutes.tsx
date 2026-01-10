/**
 * AppRoutes
 * Application route definitions
 *
 * Navigation Structure (Menu Restructure v2):
 * - Home (/) - Dashboard
 * - Markets (/markets) - Spot + Perp trading
 *   - Spot (/markets/spot) - Spot trading
 *   - Perp (/markets/perp) - Perpetual futures (Coming Soon)
 * - Predict (/predict) - Prediction markets
 * - Lottery (/lottery) - Weekly lottery
 * - Earn (/earn) - Staking + Lending (Phase 12-13)
 * - Wallet (/wallet) - Send/Receive
 * - Admin (/admin) - Unified admin dashboard
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import {
  HomePage,
  TradePage,
  EarnPage,
  WalletPage,
  PredictPage,
  PredictMarketPage,
  AuthCallbackPage,
  LotteryPage,
  LotteryRoundPage,
  AdminPage,
  PerpsComingSoonPage,
} from '../pages';

export function AppRoutes() {
  return (
    <Routes>
      {/* Home (Dashboard) */}
      <Route path="/" element={<HomePage />} />

      {/* Markets */}
      <Route path="/markets" element={<Navigate to="/markets/spot" replace />} />
      <Route path="/markets/spot" element={<TradePage />} />
      <Route path="/markets/perp" element={<PerpsComingSoonPage />} />

      {/* Wallet (Send/Receive) */}
      <Route path="/wallet" element={<WalletPage />} />

      {/* Prediction Markets */}
      <Route path="/predict" element={<PredictPage />} />
      <Route path="/predict/:marketId" element={<PredictMarketPage />} />

      {/* Lottery */}
      <Route path="/lottery" element={<LotteryPage />} />
      <Route path="/lottery/:roundId" element={<LotteryRoundPage />} />

      {/* Admin (Unified Dashboard) */}
      <Route path="/admin" element={<AdminPage />} />

      {/* Earn (Staking + Lending) */}
      <Route path="/earn" element={<EarnPage />} />

      {/* Auth (zkLogin callback) */}
      <Route path="/callback" element={<AuthCallbackPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
