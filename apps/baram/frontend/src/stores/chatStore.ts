/**
 * Chat Store - Zustand state management for chat sessions and messages
 *
 * Manages:
 * - Active session and messages
 * - Session list (encrypted in IndexedDB per wallet address)
 * - Executor and model selection
 *
 * Security:
 * - Chat history is encrypted with AES-256-GCM (dual-mode: address+password or address-only)
 * - Each wallet has its own IndexedDB database
 * - On logout: memory cleared, encrypted data remains in IndexedDB
 */

import { create } from 'zustand';
import type {
  ChatState,
  ChatActions,
  Message,
  ChatSession,
} from '../types/chat';
import { generateId, generateSessionTitle } from '../types/chat';
import {
  openDatabase,
  closeDatabase,
  saveSession,
  loadSessions,
  deleteSession as deleteSessionFromDB,
  saveMessage,
  loadMessages,
  clearAllData,
} from '../services/chatStorage';

// Settings are stored in localStorage (non-sensitive)
const SETTINGS_KEY = 'baram-chat-settings';

// Extended state with wallet tracking
interface ExtendedChatState extends ChatState {
  currentWalletAddress: string | null;
  currentPassword: string | null;
}

// Initial state
const initialState: ExtendedChatState = {
  activeSessionId: null,
  messages: [],
  sessions: [],
  selectedExecutorId: null,
  selectedModel: null,
  isLoading: false,
  isEncrypting: false,
  currentWalletAddress: null,
  currentPassword: null,
};

// Extended actions with clearOnLogout
interface ExtendedChatActions extends ChatActions {
  clearOnLogout: () => void;
}

type ExtendedChatStore = ExtendedChatState & ExtendedChatActions;

// Create the store
export const useChatStore = create<ExtendedChatStore>((set, get) => ({
  ...initialState,

  // ============================================
  // Session Management
  // ============================================

  createSession: () => {
    const sessionId = generateId();
    const now = Date.now();

    const newSession: ChatSession = {
      id: sessionId,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    set((state) => ({
      sessions: [newSession, ...state.sessions],
      activeSessionId: sessionId,
      messages: [],
    }));

    // Persist to IndexedDB (async, fire and forget)
    const { currentWalletAddress, currentPassword } = get();
    if (currentWalletAddress) {
      console.log(`[ChatStore] Saving new session ${sessionId.slice(0, 8)} to IndexedDB`);
      saveSession(currentWalletAddress, currentPassword ?? undefined, newSession).catch((err) =>
        console.warn('[ChatStore] Failed to save new session:', err)
      );
    } else {
      console.warn('[ChatStore] createSession: no wallet address, session not saved to IndexedDB');
    }

    return sessionId;
  },

  switchSession: async (sessionId: string) => {
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      console.warn('[ChatStore] switchSession: session not found:', sessionId);
      return;
    }

    const { currentWalletAddress, currentPassword, activeSessionId, messages: currentMessages } = state;
    console.log('[ChatStore] switchSession:', { from: activeSessionId, to: sessionId, walletAddress: currentWalletAddress?.slice(0, 8) });

    // Save current session's messages before switching (if connected)
    if (currentWalletAddress && activeSessionId && currentMessages.length > 0) {
      console.log(`[ChatStore] Saving ${currentMessages.length} messages for session ${activeSessionId.slice(0, 8)}...`);
      for (const msg of currentMessages) {
        await saveMessage(currentWalletAddress, currentPassword ?? undefined, activeSessionId, msg).catch((err) =>
          console.warn('[ChatStore] Failed to save message:', err)
        );
      }
    }

    // Load messages for the target session
    let messages: Message[] = [];
    if (currentWalletAddress) {
      try {
        messages = await loadMessages(currentWalletAddress, currentPassword ?? undefined, sessionId);
        console.log(`[ChatStore] Loaded ${messages.length} messages for session ${sessionId.slice(0, 8)}`);
      } catch (err) {
        console.warn('[ChatStore] Failed to load messages:', err);
      }
    } else {
      console.warn('[ChatStore] switchSession: no wallet address, cannot load messages');
    }

    set({
      activeSessionId: sessionId,
      messages,
    });
  },

  deleteSession: async (sessionId: string) => {
    const state = get();
    const { currentWalletAddress } = state;
    const isActive = state.activeSessionId === sessionId;
    const newSessions = state.sessions.filter((s) => s.id !== sessionId);
    const newActiveId = isActive ? (newSessions[0]?.id || null) : state.activeSessionId;

    // Load messages for new active session if switching
    const { currentPassword } = state;
    let newMessages: Message[] = [];
    if (isActive && newActiveId && currentWalletAddress) {
      try {
        newMessages = await loadMessages(currentWalletAddress, currentPassword ?? undefined, newActiveId);
      } catch (err) {
        console.warn('[ChatStore] Failed to load messages:', err);
      }
    } else if (!isActive) {
      newMessages = state.messages;
    }

    set({
      sessions: newSessions,
      activeSessionId: newActiveId,
      messages: newMessages,
    });

    // Delete from IndexedDB
    if (currentWalletAddress) {
      deleteSessionFromDB(currentWalletAddress, sessionId).catch((err) =>
        console.warn('[ChatStore] Failed to delete session from DB:', err)
      );
    }
  },

  clearAllSessions: async () => {
    const { currentWalletAddress } = get();

    set({
      sessions: [],
      activeSessionId: null,
      messages: [],
    });

    // Clear from IndexedDB
    if (currentWalletAddress) {
      clearAllData(currentWalletAddress).catch((err) =>
        console.warn('[ChatStore] Failed to clear data:', err)
      );
    }
  },

  // ============================================
  // Message Management
  // ============================================

  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };

    let updatedSession: ChatSession | null = null;

    set((state) => {
      const newMessages = [...state.messages, newMessage];

      // Update session title if this is the first user message
      let updatedSessions = state.sessions;
      if (state.activeSessionId && message.role === 'user' && state.messages.length === 0) {
        updatedSessions = state.sessions.map((s) => {
          if (s.id === state.activeSessionId) {
            updatedSession = {
              ...s,
              title: generateSessionTitle(message.content),
              updatedAt: Date.now(),
              messageCount: s.messageCount + 1,
            };
            return updatedSession;
          }
          return s;
        });
      } else if (state.activeSessionId) {
        // Just update message count and timestamp
        updatedSessions = state.sessions.map((s) => {
          if (s.id === state.activeSessionId) {
            updatedSession = { ...s, updatedAt: Date.now(), messageCount: s.messageCount + 1 };
            return updatedSession;
          }
          return s;
        });
      }

      return {
        messages: newMessages,
        sessions: updatedSessions,
      };
    });

    // Persist to IndexedDB
    const { currentWalletAddress, currentPassword, activeSessionId } = get();
    if (currentWalletAddress && activeSessionId) {
      console.log(`[ChatStore] Saving message ${newMessage.id.slice(0, 8)} to session ${activeSessionId.slice(0, 8)}`);
      // Save message
      saveMessage(currentWalletAddress, currentPassword ?? undefined, activeSessionId, newMessage).catch((err) =>
        console.warn('[ChatStore] Failed to save message:', err)
      );
      // Save updated session
      if (updatedSession) {
        saveSession(currentWalletAddress, currentPassword ?? undefined, updatedSession).catch((err) =>
          console.warn('[ChatStore] Failed to save session:', err)
        );
      }
    } else {
      console.warn('[ChatStore] addMessage: cannot save to IndexedDB, missing wallet or session', { currentWalletAddress: !!currentWalletAddress, activeSessionId });
    }

    return newMessage.id;
  },

  updateMessage: (id: string, updates: Partial<Message>) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));

    // Persist updated message to IndexedDB
    const { currentWalletAddress, currentPassword, activeSessionId, messages } = get();
    const updatedMessage = messages.find((m) => m.id === id);
    if (currentWalletAddress && activeSessionId && updatedMessage) {
      saveMessage(currentWalletAddress, currentPassword ?? undefined, activeSessionId, updatedMessage).catch((err) =>
        console.warn('[ChatStore] Failed to save updated message:', err)
      );
    }
  },

  // ============================================
  // Settings (stored in localStorage, non-sensitive)
  // ============================================

  setSelectedExecutor: (executorId: string | null) => {
    set({ selectedExecutorId: executorId });
  },

  setSelectedModel: (model: string | null) => {
    set({ selectedModel: model });
    saveSettingsToLocalStorage(get());
  },

  // ============================================
  // Persistence (IndexedDB with AES-256-GCM encryption)
  // ============================================

  loadFromStorage: async (walletAddress: string, password?: string) => {
    // Set wallet address and password FIRST to prevent race conditions with createSession/addMessage
    set({ isLoading: true, currentWalletAddress: walletAddress, currentPassword: password ?? null });

    try {
      // Open database for this wallet
      await openDatabase(walletAddress);

      // Load sessions
      const sessions = await loadSessions(walletAddress, password);

      // Load messages for most recent session if exists
      let activeSessionId: string | null = null;
      let messages: Message[] = [];

      if (sessions.length > 0) {
        activeSessionId = sessions[0].id;
        messages = await loadMessages(walletAddress, password, activeSessionId);
      }

      // Load settings from localStorage (non-sensitive)
      const settings = loadSettingsFromLocalStorage();

      set({
        sessions,
        activeSessionId,
        messages,
        selectedModel: settings.selectedModel,
        isLoading: false,
      });

      console.log(`[ChatStore] Loaded ${sessions.length} sessions for wallet ${walletAddress.slice(0, 8)}...`);
    } catch (error) {
      console.error('[ChatStore] Failed to load from storage:', error);
      set({ isLoading: false, currentWalletAddress: null, currentPassword: null });
    }
  },

  saveToStorage: async () => {
    const { currentWalletAddress, currentPassword, activeSessionId, messages, sessions } = get();
    if (!currentWalletAddress || !activeSessionId) return;

    set({ isEncrypting: true });

    try {
      // Save current session's messages
      for (const message of messages) {
        await saveMessage(currentWalletAddress, currentPassword ?? undefined, activeSessionId, message);
      }

      // Save session metadata
      const currentSession = sessions.find((s) => s.id === activeSessionId);
      if (currentSession) {
        await saveSession(currentWalletAddress, currentPassword ?? undefined, currentSession);
      }

      console.log('[ChatStore] Saved to encrypted storage');
    } catch (error) {
      console.error('[ChatStore] Failed to save to storage:', error);
    } finally {
      set({ isEncrypting: false });
    }
  },

  // ============================================
  // Logout (clear memory, keep encrypted data in IndexedDB)
  // ============================================

  clearOnLogout: () => {
    // Close database connection and clear encryption key
    closeDatabase();

    // Clear memory state (encrypted data remains in IndexedDB)
    set({
      currentWalletAddress: null,
      currentPassword: null,
      sessions: [],
      activeSessionId: null,
      messages: [],
      isLoading: false,
      isEncrypting: false,
      // Keep settings (selectedExecutorId, selectedModel)
    });

    console.log('[ChatStore] Cleared on logout (encrypted data preserved)');
  },

  // ============================================
  // Reset (full reset including settings)
  // ============================================

  reset: () => {
    closeDatabase();
    set(initialState);
    localStorage.removeItem(SETTINGS_KEY);
  },
}));

// ============================================
// Settings Storage (localStorage, non-sensitive)
// ============================================

interface StoredSettings {
  selectedModel: string | null;
}

function saveSettingsToLocalStorage(state: ExtendedChatState): void {
  try {
    const settings: StoredSettings = {
      selectedModel: state.selectedModel,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[ChatStore] Failed to save settings:', error);
  }
}

function loadSettingsFromLocalStorage(): StoredSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { selectedModel: parsed.selectedModel ?? null };
    }
  } catch (error) {
    console.warn('[ChatStore] Failed to load settings:', error);
  }
  return { selectedModel: null };
}

// ============================================
// Convenience Hooks
// ============================================

export function useActiveSession() {
  return useChatStore((state) => ({
    sessionId: state.activeSessionId,
    messages: state.messages,
    session: state.sessions.find((s) => s.id === state.activeSessionId),
  }));
}

export function useSessionList() {
  return useChatStore((state) => state.sessions);
}

export function useChatSettings() {
  return useChatStore((state) => ({
    executorId: state.selectedExecutorId,
    model: state.selectedModel,
    setExecutor: state.setSelectedExecutor,
    setModel: state.setSelectedModel,
  }));
}
