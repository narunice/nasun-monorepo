/**
 * ChatModeContext - Global chat display mode management.
 * Controls whether chat is docked (TradePage only), floating (all pages), or closed.
 * Persists mode to localStorage and auto-transitions docked -> floating when leaving TradePage.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

type ChatMode = 'docked' | 'floating' | 'closed';

interface ChatModeContextValue {
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  isOnTradePage: boolean;
  setOnTradePage: (value: boolean) => void;
}

const ChatModeContext = createContext<ChatModeContextValue | null>(null);

const OLD_KEY = 'pado_chat_visible';
const NEW_KEY = 'pado_chat_mode';

const VALID_MODES: ChatMode[] = ['docked', 'floating', 'closed'];

function getInitialMode(): ChatMode {
  try {
    const existing = localStorage.getItem(NEW_KEY);
    if (existing && VALID_MODES.includes(existing as ChatMode)) {
      return existing as ChatMode;
    }

    // Migrate from old key
    const old = localStorage.getItem(OLD_KEY);
    if (old !== null) {
      const migrated: ChatMode = old === 'true' ? 'docked' : 'closed';
      localStorage.setItem(NEW_KEY, migrated);
      localStorage.removeItem(OLD_KEY);
      return migrated;
    }
  } catch {
    // localStorage unavailable
  }
  return 'closed';
}

export function ChatModeProvider({ children }: { children: ReactNode }) {
  const [chatMode, setChatModeState] = useState<ChatMode>(getInitialMode);
  const [isOnTradePage, setOnTradePage] = useState(false);

  const setChatMode = useCallback((mode: ChatMode) => {
    setChatModeState(mode);
    try { localStorage.setItem(NEW_KEY, mode); } catch { /* noop */ }
  }, []);

  // Auto-close chat when navigating away from TradePage.
  // On initial load, if not on TradePage and chat was persisted as docked, close it.
  const initialRef = useRef(true);
  useEffect(() => {
    if (!isOnTradePage && chatMode !== 'closed') {
      // On initial load: close persisted docked/floating mode on non-trade pages
      // On navigation: close when leaving TradePage
      if (initialRef.current || chatMode === 'docked' || chatMode === 'floating') {
        setChatMode('closed');
      }
    }
    initialRef.current = false;
    // Only react to page changes, not chatMode changes from user interaction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnTradePage]);

  return (
    <ChatModeContext.Provider value={{ chatMode, setChatMode, isOnTradePage, setOnTradePage }}>
      {children}
    </ChatModeContext.Provider>
  );
}

export function useChatMode() {
  const ctx = useContext(ChatModeContext);
  if (!ctx) throw new Error('useChatMode must be used within ChatModeProvider');
  return ctx;
}
