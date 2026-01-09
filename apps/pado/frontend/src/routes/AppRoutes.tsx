/**
 * AppRoutes
 * Application route definitions
 *
 * Navigation Structure (UX Restructure):
 * - Home (/) - Dashboard
 * - Trade (/trade) - Spot trading
 * - Earn (/earn) - Coming soon (Phase 12-13)
 * - Predict (/predict) - Prediction markets
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
} from '../pages';

export function AppRoutes() {
  return (
    <Routes>
      {/* Home (Dashboard) */}
      <Route path="/" element={<HomePage />} />

      {/* Trade */}
      <Route path="/trade" element={<TradePage />} />

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
      {/* Legacy admin routes redirect to unified admin */}
      <Route path="/predict/admin" element={<Navigate to="/admin" replace />} />
      <Route path="/lottery/admin" element={<Navigate to="/admin" replace />} />

      {/* Legacy redirects for backward compatibility */}
      <Route path="/portfolio" element={<Navigate to="/" replace />} />
      <Route path="/send" element={<Navigate to="/wallet" replace />} />

      {/* Earn (Staking + Lending) */}
      <Route path="/earn" element={<EarnPage />} />

      {/* Auth (zkLogin callback) */}
      <Route path="/callback" element={<AuthCallbackPage />} />

      {/* Future routes */}
      {/* <Route path="/perps" element={<PerpsPage />} /> */}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
