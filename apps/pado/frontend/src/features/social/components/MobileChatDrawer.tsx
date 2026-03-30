import { ChatPanel } from './ChatPanel';
import { useChatMode } from '../context/ChatModeContext';

export function MobileChatDrawer() {
  const { chatMode, setChatMode } = useChatMode();
  const isOpen = chatMode === 'floating';

  return (
    <>
      {/* Floating Action Button: visible when not floating (floating = drawer already open) */}
      {!isOpen && (
        <button
          onClick={() => setChatMode('floating')}
          className="fixed bottom-[72px] md:bottom-4 right-4 z-40 xl:hidden
            w-12 h-12 rounded-full
            bg-theme-accent text-white shadow-lg
            flex items-center justify-center
            hover:opacity-90 transition-opacity"
          title="Open chat"
          aria-label="Open chat"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {/* Activity dot */}
          <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-theme-bg-primary animate-pulse" />
        </button>
      )}

      {/* Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setChatMode('closed')}
          />
        </div>
      )}

      {/* ChatPanel: mounted when not closed (hidden when drawer is closed) */}
      {chatMode !== 'closed' && (
        <div className={isOpen
          ? 'fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm xl:hidden bg-theme-bg-primary shadow-xl animate-slide-in'
          : 'hidden'
        }>
          <ChatPanel onMinimize={() => setChatMode('closed')} />
        </div>
      )}
    </>
  );
}
