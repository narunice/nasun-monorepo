import { useState } from 'react';
import { ChatPanel } from './ChatPanel';

export function MobileChatDrawer() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[72px] md:bottom-4 right-4 z-40 xl:hidden
          w-12 h-12 rounded-full
          bg-theme-accent text-white shadow-lg
          flex items-center justify-center
          hover:opacity-90 transition-opacity"
        title="Open chat"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {/* Activity dot */}
        <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-theme-bg-primary animate-pulse" />
      </button>

      {/* Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-theme-bg-primary shadow-xl
            animate-slide-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
              <span className="text-sm font-medium text-theme-text-primary">Chat</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-theme-text-muted hover:text-theme-text-primary"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ChatPanel always mounted to maintain WebSocket connection;
          hidden when drawer is closed to avoid disconnect/reconnect cycles */}
      <div className={isOpen ? 'fixed right-0 top-[52px] bottom-0 z-50 w-full max-w-sm xl:hidden' : 'hidden'}>
        <ChatPanel />
      </div>
    </>
  );
}
