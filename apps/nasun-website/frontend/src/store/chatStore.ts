import { create } from 'zustand';
import type { ChatMessage, ChatConnectionStatus } from '../lib/chat-service';

interface ChatState {
  messages: ChatMessage[];
  status: ChatConnectionStatus;
  onlineCount: number;
  isOpen: boolean;
  hasMore: boolean;

  // Actions
  addMessage: (msg: ChatMessage) => void;
  setHistory: (messages: ChatMessage[], hasMore: boolean) => void;
  prependHistory: (messages: ChatMessage[], hasMore: boolean) => void;
  setStatus: (status: ChatConnectionStatus) => void;
  setOnlineCount: (count: number) => void;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  clearMessages: () => void;
}

const MAX_MESSAGES = 500;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  status: 'disconnected',
  onlineCount: 0,
  isOpen: false,
  hasMore: false,

  addMessage: (msg) =>
    set((state) => {
      const messages = [...state.messages, msg];
      // Cap messages to prevent memory bloat
      if (messages.length > MAX_MESSAGES) {
        return { messages: messages.slice(-MAX_MESSAGES), hasMore: true };
      }
      return { messages };
    }),

  setHistory: (messages, hasMore) =>
    set({ messages, hasMore }),

  prependHistory: (older, hasMore) =>
    set((state) => ({
      messages: [...older, ...state.messages],
      hasMore,
    })),

  setStatus: (status) => set({ status }),
  setOnlineCount: (onlineCount) => set({ onlineCount }),
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  clearMessages: () => set({ messages: [], hasMore: false }),
}));
