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
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import {
  HomePage,
  TradePage,
  EarnPage,
  WalletPage,
  PredictPage,
  PredictMarketPage,
  PredictAdminPage,
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
      <Route path="/predict/admin" element={<PredictAdminPage />} />
      <Route path="/predict/:marketId" element={<PredictMarketPage />} />

      {/* Legacy redirects for backward compatibility */}
      <Route path="/portfolio" element={<Navigate to="/" replace />} />
      <Route path="/send" element={<Navigate to="/wallet" replace />} />

      {/* Earn (Staking + Lending) */}
      <Route path="/earn" element={<EarnPage />} />

      {/* Future routes */}
      {/* <Route path="/perps" element={<PerpsPage />} /> */}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
