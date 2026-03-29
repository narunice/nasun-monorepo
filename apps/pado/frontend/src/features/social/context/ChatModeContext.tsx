/**
 * ChatModeContext - Global chat display mode management.
 * Controls whether chat is docked (TradePage only), floating (all pages), or closed.
 * Persists mode to localStorage and auto-transitions docked -> floating when leaving TradePage.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

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
  return 'docked';
}

export function ChatModeProvider({ children }: { children: ReactNode }) {
  const [chatMode, setChatModeState] = useState<ChatMode>(getInitialMode);
  const [isOnTradePage, setOnTradePage] = useState(false);

  const setChatMode = useCallback((mode: ChatMode) => {
    setChatModeState(mode);
    try { localStorage.setItem(NEW_KEY, mode); } catch { /* noop */ }
  }, []);

  // Auto-transition: docked -> floating when leaving TradePage
  useEffect(() => {
    if (!isOnTradePage && chatMode === 'docked') {
      setChatMode('floating');
    }
  }, [isOnTradePage, chatMode, setChatMode]);

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
