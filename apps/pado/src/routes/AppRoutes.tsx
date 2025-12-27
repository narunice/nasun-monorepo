/**
 * AppRoutes
 * 애플리케이션 라우트 정의
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { TradePage } from '../pages';

export function AppRoutes() {
  return (
    <Routes>
      {/* Trading (기본 페이지) */}
      <Route path="/" element={<TradePage />} />
      <Route path="/trade" element={<TradePage />} />

      {/* 향후 추가 예정 */}
      {/* <Route path="/predict" element={<PredictPage />} /> */}
      {/* <Route path="/lend" element={<LendPage />} /> */}
      {/* <Route path="/portfolio" element={<PortfolioPage />} /> */}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
