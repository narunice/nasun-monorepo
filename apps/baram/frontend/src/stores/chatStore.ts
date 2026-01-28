/**
 * Chat Store - Zustand state management for chat sessions and messages
 *
 * Manages:
 * - Active session and messages
 * - Session list (persisted to IndexedDB when encryption is ready)
 * - Executor and model selection
 */

import { create } from 'zustand';
import type {
  ChatState,
  ChatActions,
  ChatStore,
  Message,
  ChatSession,
} from '../types/chat';
import { generateId, generateSessionTitle } from '../types/chat';

const STORAGE_KEY = 'baram-chat-state';

// Initial state
const initialState: ChatState = {
  activeSessionId: null,
  messages: [],
  sessions: [],
  selectedExecutorId: null,
  selectedModel: null,
  isLoading: false,
  isEncrypting: false,
};

// Create the store
export const useChatStore = create<ChatStore>((set, get) => ({
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

    // Persist to localStorage (temporary until IndexedDB is ready)
    saveToLocalStorage(get());

    return sessionId;
  },

  switchSession: async (sessionId: string) => {
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // TODO: Load messages from IndexedDB when encryption is ready
    // For now, we just switch the active session
    set({
      activeSessionId: sessionId,
      messages: [], // Will be loaded from storage
    });

    // Load messages from localStorage (temporary)
    const stored = loadFromLocalStorage();
    if (stored && stored.activeSessionId === sessionId) {
      set({ messages: stored.messages });
    }
  },

  deleteSession: async (sessionId: string) => {
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== sessionId);
      const isActive = state.activeSessionId === sessionId;

      return {
        sessions: newSessions,
        activeSessionId: isActive ? (newSessions[0]?.id || null) : state.activeSessionId,
        messages: isActive ? [] : state.messages,
      };
    });

    saveToLocalStorage(get());
  },

  clearAllSessions: async () => {
    set({
      sessions: [],
      activeSessionId: null,
      messages: [],
    });

    localStorage.removeItem(STORAGE_KEY);
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

    set((state) => {
      const newMessages = [...state.messages, newMessage];

      // Update session title if this is the first user message
      let updatedSessions = state.sessions;
      if (state.activeSessionId && message.role === 'user' && state.messages.length === 0) {
        updatedSessions = state.sessions.map((s) =>
          s.id === state.activeSessionId
            ? {
                ...s,
                title: generateSessionTitle(message.content),
                updatedAt: Date.now(),
                messageCount: s.messageCount + 1,
              }
            : s
        );
      } else if (state.activeSessionId) {
        // Just update message count and timestamp
        updatedSessions = state.sessions.map((s) =>
          s.id === state.activeSessionId
            ? { ...s, updatedAt: Date.now(), messageCount: s.messageCount + 1 }
            : s
        );
      }

      return {
        messages: newMessages,
        sessions: updatedSessions,
      };
    });

    saveToLocalStorage(get());
  },

  updateMessage: (id: string, updates: Partial<Message>) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));

    saveToLocalStorage(get());
  },

  // ============================================
  // Settings
  // ============================================

  setSelectedExecutor: (executorId: string | null) => {
    set({ selectedExecutorId: executorId });
    saveToLocalStorage(get());
  },

  setSelectedModel: (model: string | null) => {
    set({ selectedModel: model });
    saveToLocalStorage(get());
  },

  // ============================================
  // Persistence (temporary localStorage, will migrate to IndexedDB)
  // ============================================

  loadFromStorage: async (walletAddress: string) => {
    // TODO: Implement encrypted IndexedDB storage
    // For now, use localStorage
    const stored = loadFromLocalStorage();
    if (stored) {
      set({
        sessions: stored.sessions || [],
        activeSessionId: stored.activeSessionId,
        messages: stored.messages || [],
        selectedExecutorId: stored.selectedExecutorId,
        selectedModel: stored.selectedModel,
      });
    }
  },

  saveToStorage: async () => {
    saveToLocalStorage(get());
  },

  // ============================================
  // Reset
  // ============================================

  reset: () => {
    set(initialState);
  },
}));

// ============================================
// Local Storage Helpers (temporary)
// ============================================

interface StoredState {
  activeSessionId: string | null;
  messages: Message[];
  sessions: ChatSession[];
  selectedExecutorId: string | null;
  selectedModel: string | null;
}

function saveToLocalStorage(state: ChatState): void {
  try {
    const toStore: StoredState = {
      activeSessionId: state.activeSessionId,
      messages: state.messages,
      sessions: state.sessions,
      selectedExecutorId: state.selectedExecutorId,
      selectedModel: state.selectedModel,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.warn('[ChatStore] Failed to save to localStorage:', error);
  }
}

function loadFromLocalStorage(): StoredState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('[ChatStore] Failed to load from localStorage:', error);
  }
  return null;
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
