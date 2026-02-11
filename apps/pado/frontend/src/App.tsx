/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { Header, MobileBottomNav } from './components/layout';
import { AppRoutes } from './routes';
import { OfflineBanner } from './components/common/OfflineBanner';

export default function App() {
  return (
    <div className="min-h-screen bg-theme-bg-primary text-theme-text-primary">
      <OfflineBanner />
      <Header />

      {/* Main Content - No max-width for full-width trading experience */}
      {/* pb-16 on mobile reserves space for MobileBottomNav (56px + safe area) */}
      <main className="px-3 sm:px-4 py-4 sm:py-6 pb-20 md:pb-6">
        <AppRoutes />
      </main>

      {/* Mobile bottom navigation bar (< md) */}
      <MobileBottomNav />
    </div>
  );
}
