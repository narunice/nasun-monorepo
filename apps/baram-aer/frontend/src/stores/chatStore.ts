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
import { deriveStorageKey } from '../services/chatCrypto';
import { PRIVACY_MODE_CONFIG, DEFAULT_PRIVACY_MODE, MODEL_PRICING, type ModelId } from '../config/network';

// Settings are stored in localStorage (non-sensitive)
const SETTINGS_KEY = 'baram-chat-settings';

// Extended state with wallet tracking
// NOTE: Password is NOT stored here. The encryption key is derived once
// during loadFromStorage and cached in chatCrypto module. All subsequent
// storage operations use the cached CryptoKey.
interface ExtendedChatState extends ChatState {
  currentWalletAddress: string | null;
  privacyMode: boolean;
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
  privacyMode: DEFAULT_PRIVACY_MODE,
};

// Extended actions with clearOnLogout
interface ExtendedChatActions extends ChatActions {
  clearOnLogout: () => void;
  setPrivacyMode: (mode: boolean) => void;
}

type ExtendedChatStore = ExtendedChatState & ExtendedChatActions;

// Concurrency guard for switchSession to prevent interleaved async operations
let switchSessionLock = false;

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

    // Persist to IndexedDB (async, fire and forget — uses cached CryptoKey)
    const { currentWalletAddress } = get();
    if (currentWalletAddress) {
      saveSession(currentWalletAddress, undefined, newSession).catch((err) =>
        console.warn('[ChatStore] Failed to save new session:', err)
      );
    } else {
      console.warn('[ChatStore] createSession: no wallet address, session not saved to IndexedDB');
    }

    return sessionId;
  },

  switchSession: async (sessionId: string) => {
    if (switchSessionLock) return;
    switchSessionLock = true;

    try {
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      console.warn('[ChatStore] switchSession: session not found:', sessionId);
      return;
    }

    const { currentWalletAddress, activeSessionId, messages: currentMessages } = state;

    // Save current session's messages before switching (uses cached CryptoKey)
    if (currentWalletAddress && activeSessionId && currentMessages.length > 0) {
      for (const msg of currentMessages) {
        await saveMessage(currentWalletAddress, undefined, activeSessionId, msg).catch((err) =>
          console.warn('[ChatStore] Failed to save message:', err)
        );
      }
    }

    // Load messages for the target session
    let messages: Message[] = [];
    if (currentWalletAddress) {
      try {
        messages = await loadMessages(currentWalletAddress, undefined, sessionId);
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
    } finally {
      switchSessionLock = false;
    }
  },

  deleteSession: async (sessionId: string) => {
    const state = get();
    const { currentWalletAddress } = state;
    const isActive = state.activeSessionId === sessionId;
    const newSessions = state.sessions.filter((s) => s.id !== sessionId);
    const newActiveId = isActive ? (newSessions[0]?.id || null) : state.activeSessionId;

    // Load messages for new active session if switching (uses cached CryptoKey)
    let newMessages: Message[] = [];
    if (isActive && newActiveId && currentWalletAddress) {
      try {
        newMessages = await loadMessages(currentWalletAddress, undefined, newActiveId);
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

    // Persist to IndexedDB (uses cached CryptoKey)
    const { currentWalletAddress, activeSessionId } = get();
    if (currentWalletAddress && activeSessionId) {
      saveMessage(currentWalletAddress, undefined, activeSessionId, newMessage).catch((err) =>
        console.warn('[ChatStore] Failed to save message:', err)
      );
      if (updatedSession) {
        saveSession(currentWalletAddress, undefined, updatedSession).catch((err) =>
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

    // Persist updated message to IndexedDB (uses cached CryptoKey)
    const { currentWalletAddress, activeSessionId, messages } = get();
    const updatedMessage = messages.find((m) => m.id === id);
    if (currentWalletAddress && activeSessionId && updatedMessage) {
      saveMessage(currentWalletAddress, undefined, activeSessionId, updatedMessage).catch((err) =>
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

  setPrivacyMode: (mode: boolean) => {
    const config = mode ? PRIVACY_MODE_CONFIG.private : PRIVACY_MODE_CONFIG.standard;
    const currentModel = get().selectedModel;

    // Check if current model is allowed in the new mode
    const currentModelConfig = currentModel ? MODEL_PRICING[currentModel as ModelId] : null;
    const isAllowed = currentModelConfig &&
      (config.allowedProviders as readonly string[]).includes(currentModelConfig.provider);

    // Save current model for the departing mode, restore for arriving mode
    const settings = loadSettingsFromLocalStorage();
    if (currentModel) {
      if (mode) {
        settings.lastStandardModel = currentModel;
      } else {
        settings.lastPrivateModel = currentModel;
      }
    }

    // Pick model: keep if allowed, restore last used (with validation), or use default
    let newModel: string;
    if (isAllowed) {
      newModel = currentModel!;
    } else {
      const lastModel = mode ? settings.lastPrivateModel : settings.lastStandardModel;
      const lastModelConfig = lastModel ? MODEL_PRICING[lastModel as ModelId] : null;
      const isLastModelAllowed = lastModelConfig &&
        (config.allowedProviders as readonly string[]).includes(lastModelConfig.provider);
      newModel = isLastModelAllowed ? lastModel! : config.defaultModelId;
    }

    set({ privacyMode: mode, selectedModel: newModel });
    saveSettingsToLocalStorage(get(), {
      lastStandardModel: settings.lastStandardModel,
      lastPrivateModel: settings.lastPrivateModel,
    });
  },

  // ============================================
  // Persistence (IndexedDB with AES-256-GCM encryption)
  // ============================================

  loadFromStorage: async (walletAddress: string, password?: string) => {
    // Set wallet address FIRST to prevent race conditions with createSession/addMessage
    set({ isLoading: true, currentWalletAddress: walletAddress });

    try {
      // Open database for this wallet
      await openDatabase(walletAddress);

      // Derive and cache encryption key once — password is consumed here and not stored
      await deriveStorageKey(walletAddress, password);

      // Load sessions (uses cached CryptoKey via getKey)
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

      // Validate savedModel is compatible with the saved privacyMode
      const privacyMode = settings.privacyMode;
      const modeConfig = privacyMode ? PRIVACY_MODE_CONFIG.private : PRIVACY_MODE_CONFIG.standard;
      const savedModelConfig = settings.selectedModel ? MODEL_PRICING[settings.selectedModel as ModelId] : null;
      const isSavedModelAllowed = savedModelConfig &&
        (modeConfig.allowedProviders as readonly string[]).includes(savedModelConfig.provider);

      const resolvedModel = isSavedModelAllowed
        ? settings.selectedModel!
        : modeConfig.defaultModelId;

      set({
        sessions,
        activeSessionId,
        messages,
        selectedModel: resolvedModel,
        privacyMode,
        isLoading: false,
      });

    } catch (error) {
      console.error('[ChatStore] Failed to load from storage:', error);
      set({ isLoading: false, currentWalletAddress: null });
    }
  },

  saveToStorage: async () => {
    const { currentWalletAddress, activeSessionId, messages, sessions } = get();
    if (!currentWalletAddress || !activeSessionId) return;

    set({ isEncrypting: true });

    try {
      // Save current session's messages (uses cached CryptoKey)
      for (const message of messages) {
        await saveMessage(currentWalletAddress, undefined, activeSessionId, message);
      }

      // Save session metadata
      const currentSession = sessions.find((s) => s.id === activeSessionId);
      if (currentSession) {
        await saveSession(currentWalletAddress, undefined, currentSession);
      }

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
      sessions: [],
      activeSessionId: null,
      messages: [],
      isLoading: false,
      isEncrypting: false,
      // Keep settings (selectedExecutorId, selectedModel)
    });

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
  privacyMode: boolean;
  lastStandardModel: string | null;
  lastPrivateModel: string | null;
}

function saveSettingsToLocalStorage(state: ExtendedChatState, overrides?: Partial<StoredSettings>): void {
  try {
    const existing = loadSettingsFromLocalStorage();
    const settings: StoredSettings = {
      selectedModel: state.selectedModel,
      privacyMode: state.privacyMode,
      lastStandardModel: existing.lastStandardModel,
      lastPrivateModel: existing.lastPrivateModel,
      ...overrides,
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
      return {
        selectedModel: parsed.selectedModel ?? null,
        privacyMode: parsed.privacyMode ?? DEFAULT_PRIVACY_MODE,
        lastStandardModel: parsed.lastStandardModel ?? null,
        lastPrivateModel: parsed.lastPrivateModel ?? null,
      };
    }
  } catch (error) {
    console.warn('[ChatStore] Failed to load settings:', error);
  }
  return { selectedModel: null, privacyMode: DEFAULT_PRIVACY_MODE, lastStandardModel: null, lastPrivateModel: null };
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
    privacyMode: state.privacyMode,
    setExecutor: state.setSelectedExecutor,
    setModel: state.setSelectedModel,
    setPrivacyMode: state.setPrivacyMode,
  }));
}
