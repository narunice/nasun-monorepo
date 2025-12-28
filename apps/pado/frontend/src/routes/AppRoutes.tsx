/**
 * AppRoutes
 * 애플리케이션 라우트 정의
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { TradePage, PortfolioPage, PaymentPage } from '../pages';

export function AppRoutes() {
  return (
    <Routes>
      {/* Trading (기본 페이지) */}
      <Route path="/" element={<TradePage />} />
      <Route path="/trade" element={<TradePage />} />

      {/* Portfolio */}
      <Route path="/portfolio" element={<PortfolioPage />} />

      {/* Send (Payment) */}
      <Route path="/send" element={<PaymentPage />} />

      {/* 향후 추가 예정 */}
      {/* <Route path="/perps" element={<PerpsPage />} /> */}
      {/* <Route path="/lend" element={<LendPage />} /> */}
      {/* <Route path="/predict" element={<PredictPage />} /> */}
      {/* <Route path="/stake" element={<StakePage />} /> */}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
