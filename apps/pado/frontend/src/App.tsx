/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { Turnstile } from '@marsidev/react-turnstile';
import { Header, Footer, MobileBottomNav } from './components/layout';
import { AppRoutes } from './routes';
import { OfflineBanner } from './components/common/OfflineBanner';
import { useChatMode, FloatingChatPopup, MobileChatDrawer, useChatTurnstilePrewarm } from './features/social';
import { useCrossAppArrival } from './hooks/useCrossAppArrival';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/**
 * Pre-warm the invisible Turnstile challenge at the App root so it completes
 * in the background before the user clicks the chat button. Turnstile tokens
 * are site-bound (not user-bound), so we start the challenge at page load —
 * independent of wallet connection — to eliminate the multi-second
 * "Connecting..." delay that would otherwise occur the first time the chat
 * panel mounts.
 */
function ChatTurnstilePrewarm() {
  const { turnstileKey, onSuccess, onError } = useChatTurnstilePrewarm();

  if (!TURNSTILE_SITE_KEY) return null;

  // size:'invisible' renders nothing for clean IPs; CF auto-escalates with
  // its own modal overlay when interactive challenge is needed. The host
  // element stays in the normal flow (NOT display:none) so the iframe is
  // interactable in the rare interactive-fallback case. The previous
  // display:none + appearance:'execute' combo trapped users on
  // suspicious-IP networks (2026-05-09 outage).
  return (
    <Turnstile
      key={turnstileKey}
      siteKey={TURNSTILE_SITE_KEY}
      options={{ size: 'invisible' }}
      onSuccess={onSuccess}
      onError={onError}
      onExpire={onError}
    />
  );
}

function ChatLayer() {
  const { chatMode, setChatMode, isOnTradePage } = useChatMode();
  return (
    <>
      {/* Desktop chat FAB (xl+): visible when chat is not open and not on TradePage */}
      {chatMode !== 'floating' && !isOnTradePage && (
        <button
          className="hidden xl:flex fixed z-40 bottom-6 right-6 w-12 h-12
            rounded-full bg-theme-accent text-white shadow-lg
            items-center justify-center hover:opacity-90 transition-opacity"
          onClick={() => setChatMode('floating')}
          aria-label="Open chat"
          title="Open chat"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Desktop floating popup (xl+) */}
      {chatMode === 'floating' && (
        <div className="hidden xl:block">
          <FloatingChatPopup
            onDock={isOnTradePage ? () => setChatMode('docked') : undefined}
            onClose={() => setChatMode('closed')}
          />
        </div>
      )}

      {/* Mobile/tablet drawer (< xl) */}
      <MobileChatDrawer />
    </>
  );
}

export default function App() {
  useCrossAppArrival();
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

      {/* Invisible Turnstile that completes the bot challenge in the
          background so opening the chat panel doesn't block on it. */}
      <ChatTurnstilePrewarm />
    </div>
  );
}
