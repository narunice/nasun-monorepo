/**
 * Per-agent chat state for the Nasun AI sub-tab.
 *
 * Scope: one wallet + one agent owns one running conversation. Messages are
 * persisted to IndexedDB (encrypted) via chatStorage; model selection lives in
 * localStorage under a wallet-scoped key.
 *
 * This differs from baram's chatStore: there is no multi-session list, no
 * privacy-mode toggle (the model selector in ChatInput decides cloud vs TEE),
 * and the IndexedDB namespace is `nasun-ai-chat-*`.
 */

import { create } from 'zustand';
import type { Message } from '../types/chat';
import { generateId } from '../types/chat';
import {
  openDatabase,
  closeDatabase,
  loadMessages,
  saveMessage,
  clearAgentMessages,
} from '../services/chatStorage';
import { DEFAULT_MODEL, MODEL_PRICING, type ModelId } from '../services/network';

const SETTINGS_KEY = 'nasun-ai-chat-settings';

interface StoredSettings {
  selectedModel: ModelId;
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      if (parsed.selectedModel && parsed.selectedModel in MODEL_PRICING) {
        return { selectedModel: parsed.selectedModel as ModelId };
      }
    }
  } catch {
    // ignore
  }
  return { selectedModel: DEFAULT_MODEL };
}

function saveSettings(settings: StoredSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface ChatState {
  walletAddress: string | null;
  agentId: string | null;
  messages: Message[];
  selectedModel: ModelId;
  isLoading: boolean;
}

interface ChatActions {
  load: (walletAddress: string, agentId: string) => Promise<void>;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setSelectedModel: (model: ModelId) => void;
  clear: () => Promise<void>;
  reset: () => void;
}

const initial: ChatState = {
  walletAddress: null,
  agentId: null,
  messages: [],
  selectedModel: loadSettings().selectedModel,
  isLoading: false,
};

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  ...initial,

  load: async (walletAddress, agentId) => {
    const current = get();
    if (current.walletAddress === walletAddress && current.agentId === agentId) return;

    set({ walletAddress, agentId, messages: [], isLoading: true });
    try {
      await openDatabase(walletAddress);
      const messages = await loadMessages(walletAddress, agentId);
      set({ messages, isLoading: false });
    } catch (err) {
      console.warn('[ChatStore] Failed to load messages:', err);
      set({ isLoading: false });
    }
  },

  addMessage: (message) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));

    const { walletAddress, agentId } = get();
    if (walletAddress && agentId) {
      saveMessage(walletAddress, agentId, newMessage).catch((err) =>
        console.warn('[ChatStore] Failed to persist message:', err),
      );
    }
    return newMessage.id;
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
    const { walletAddress, agentId, messages } = get();
    const updated = messages.find((m) => m.id === id);
    if (walletAddress && agentId && updated) {
      saveMessage(walletAddress, agentId, updated).catch((err) =>
        console.warn('[ChatStore] Failed to persist updated message:', err),
      );
    }
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
    saveSettings({ selectedModel: model });
  },

  clear: async () => {
    const { walletAddress, agentId } = get();
    set({ messages: [] });
    if (walletAddress && agentId) {
      try {
        await clearAgentMessages(walletAddress, agentId);
      } catch (err) {
        console.warn('[ChatStore] Failed to clear messages:', err);
      }
    }
  },

  reset: () => {
    closeDatabase();
    set({ ...initial, selectedModel: loadSettings().selectedModel });
  },
}));
