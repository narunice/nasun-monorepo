/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { Header, Footer, MobileBottomNav } from './components/layout';
import { AppRoutes } from './routes';
import { OfflineBanner } from './components/common/OfflineBanner';
import { useChatMode, FloatingChatPopup, MobileChatDrawer } from './features/social';

function ChatLayer() {
  const { chatMode, setChatMode, isOnTradePage } = useChatMode();
  return (
    <>
      {/* Desktop floating (xl+) */}
      {chatMode === 'floating' && (
        <div className="hidden xl:block">
          <FloatingChatPopup
            onDock={isOnTradePage ? () => setChatMode('docked') : undefined}
            onClose={() => setChatMode('closed')}
          />
        </div>
      )}
      {/* Mobile/tablet (< xl) */}
      <MobileChatDrawer />
    </>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-theme-bg-primary text-theme-text-primary">
      <OfflineBanner />
      <Header />

      {/* Main Content - No max-width for full-width trading experience */}
      {/* pb-16 on mobile reserves space for MobileBottomNav (56px + safe area) */}
      <main className="flex-1 px-3 sm:px-4 py-4 sm:py-6 pb-20 md:pb-6">
        <AppRoutes />
      </main>

      <Footer />

      {/* Mobile bottom navigation bar (< md) */}
      <MobileBottomNav />

      {/* Chat layer: outside <main>, uses position:fixed so no padding issue */}
      <ChatLayer />
    </div>
  );
}
