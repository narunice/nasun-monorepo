/**
 * Per-agent multi-session chat state for the Nasun AI sub-tab.
 *
 * Scope: one wallet + one agent can host many sessions, with one active at a
 * time. Sessions + messages are persisted (encrypted) to IndexedDB via
 * chatStorage. Model selection lives in localStorage under a wallet-scoped key.
 */

import { create } from 'zustand';
import type { ChatSession, Message, SessionKind } from '../types/chat';
import { generateId, generateSessionTitle } from '../types/chat';
import {
  openDatabase,
  closeDatabase,
  loadSessions,
  loadAllSessionsForWallet,
  loadSessionMessages,
  saveSession,
  saveMessage,
  deleteSession,
  migrateLegacyMessages,
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
      if (
        parsed.selectedModel &&
        parsed.selectedModel in MODEL_PRICING &&
        MODEL_PRICING[parsed.selectedModel as ModelId].available
      ) {
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
  /**
   * When the store is loaded in *per-agent* mode (`load(wallet, agentId)`),
   * this scopes the sidebar to one agent. When loaded in *wallet* mode
   * (`loadForWallet(wallet, defaultAgentId)`), this is null and the sidebar
   * shows every session this wallet owns.
   */
  agentId: string | null;
  /** Agent to bill the next new session against in wallet mode. */
  defaultAgentId: string | null;
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: Message[];
  selectedModel: ModelId;
  isLoading: boolean;
}

export interface CreateSessionOptions {
  /** Bill this session against a specific agent. Falls back to the store's
   * current per-agent scope, then to the wallet-mode default. */
  agentId?: string;
  /** Internal kind tag. Default 'generic'. UI never exposes this as a toggle. */
  kind?: SessionKind;
  /** Required when kind='agent'. Pins the capability so a wake job's chatToken
   * stays valid across cap rotations of the same (wallet, agent). */
  capabilityId?: string;
}

interface ChatActions {
  load: (walletAddress: string, agentId: string) => Promise<void>;
  /**
   * Wallet-scoped load for the top-level Chat view. Pulls every session this
   * wallet owns across every agent. `defaultAgentId` is the agent to bill the
   * next *new* session against — typically the wallet's first active agent.
   */
  loadForWallet: (walletAddress: string, defaultAgentId: string | null) => Promise<void>;
  createSession: (opts?: CreateSessionOptions | string) => Promise<string>;
  switchSession: (sessionId: string) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setSelectedModel: (model: ModelId) => void;
  /** Switch the agent that will pay for new sessions started from this point. */
  setDefaultAgentId: (agentId: string | null) => void;
  reset: () => void;
}

const initial: ChatState = {
  walletAddress: null,
  agentId: null,
  defaultAgentId: null,
  sessions: [],
  currentSessionId: null,
  messages: [],
  selectedModel: loadSettings().selectedModel,
  isLoading: false,
};

function persistSession(walletAddress: string, session: ChatSession): void {
  saveSession(walletAddress, session).catch((err) =>
    console.warn('[ChatStore] Failed to persist session:', err),
  );
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  ...initial,

  load: async (walletAddress, agentId) => {
    const current = get();
    if (current.walletAddress === walletAddress && current.agentId === agentId) return;

    set({
      walletAddress,
      agentId,
      defaultAgentId: agentId,
      sessions: [],
      currentSessionId: null,
      messages: [],
      isLoading: true,
    });
    try {
      await openDatabase(walletAddress);
      let sessions = await loadSessions(walletAddress, agentId);
      if (sessions.length === 0) {
        // First load on the new schema for this agent. Bundle any v1
        // single-conversation messages into a synthetic session so the user
        // does not lose history.
        const migrated = await migrateLegacyMessages(walletAddress, agentId);
        if (migrated) sessions = [migrated];
      }

      if (sessions.length === 0) {
        // No sessions and nothing to migrate — start with a fresh empty one
        // so the messages pane is immediately usable.
        const now = Date.now();
        const session: ChatSession = {
          id: generateId(),
          agentId,
          title: 'New chat',
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
        };
        persistSession(walletAddress, session);
        set({
          sessions: [session],
          currentSessionId: session.id,
          messages: [],
          isLoading: false,
        });
        return;
      }

      const newest = sessions[0];
      const messages = await loadSessionMessages(walletAddress, newest.id);
      set({
        sessions,
        currentSessionId: newest.id,
        messages,
        isLoading: false,
      });
    } catch (err) {
      console.warn('[ChatStore] Failed to load chat state:', err);
      set({ isLoading: false });
    }
  },

  loadForWallet: async (walletAddress, defaultAgentId) => {
    const current = get();
    if (
      current.walletAddress === walletAddress &&
      current.agentId === null &&
      current.defaultAgentId === defaultAgentId
    ) {
      return;
    }
    set({
      walletAddress,
      agentId: null,
      defaultAgentId,
      sessions: [],
      currentSessionId: null,
      messages: [],
      isLoading: true,
    });
    try {
      await openDatabase(walletAddress);
      const sessions = await loadAllSessionsForWallet(walletAddress);
      if (sessions.length === 0) {
        // Defer creating a first session until the user clicks New chat or
        // sends a prompt. Without a defaultAgentId there is no capability
        // to bill, and silently auto-creating one would race with the
        // agent list still loading.
        set({ sessions: [], currentSessionId: null, messages: [], isLoading: false });
        return;
      }
      const newest = sessions[0];
      const messages = await loadSessionMessages(walletAddress, newest.id);
      set({ sessions, currentSessionId: newest.id, messages, isLoading: false });
    } catch (err) {
      console.warn('[ChatStore] Failed to load wallet chat state:', err);
      set({ isLoading: false });
    }
  },

  createSession: async (opts) => {
    const { walletAddress, agentId, defaultAgentId } = get();
    if (!walletAddress) throw new Error('Wallet not loaded');
    // Back-compat: callers still pass createSession('0x...') as a string.
    // Treat that as { agentId } so the legacy ChatView code path keeps working.
    const norm = typeof opts === 'string' ? { agentId: opts } : (opts ?? {});
    // Resolution order:
    //   1. explicit per-call override (e.g. user picked from agent dropdown)
    //   2. per-agent-mode scoping (load(wallet, agentId))
    //   3. wallet-mode default (loadForWallet defaultAgentId)
    const sessionAgentId = norm.agentId ?? agentId ?? defaultAgentId;
    if (!sessionAgentId) throw new Error('No agent selected to bill this chat');
    const kind: SessionKind = norm.kind ?? 'generic';
    if (kind === 'agent' && !norm.capabilityId) {
      throw new Error('capabilityId required for agent-mode session');
    }
    const now = Date.now();
    const session: ChatSession = {
      id: generateId(),
      agentId: sessionAgentId,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      sessionKind: kind,
      capabilityId: norm.capabilityId,
    };
    persistSession(walletAddress, session);
    set((s) => ({
      sessions: [session, ...s.sessions],
      currentSessionId: session.id,
      messages: [],
    }));
    return session.id;
  },

  switchSession: async (sessionId) => {
    const { walletAddress, currentSessionId } = get();
    if (!walletAddress) return;
    if (sessionId === currentSessionId) return;
    set({ currentSessionId: sessionId, messages: [], isLoading: true });
    try {
      const messages = await loadSessionMessages(walletAddress, sessionId);
      set({ messages, isLoading: false });
    } catch (err) {
      console.warn('[ChatStore] Failed to switch session:', err);
      set({ isLoading: false });
    }
  },

  removeSession: async (sessionId) => {
    const { walletAddress, agentId, defaultAgentId, sessions, currentSessionId } = get();
    if (!walletAddress) return;
    try {
      await deleteSession(walletAddress, sessionId);
    } catch (err) {
      console.warn('[ChatStore] Failed to delete session:', err);
      return;
    }
    const remaining = sessions.filter((s) => s.id !== sessionId);
    if (remaining.length === 0) {
      // Always keep at least one usable session so the input is never
      // orphaned — but only in per-agent mode, where we know which agent
      // to bill. In wallet mode without an agent, leave the list empty so
      // the UI can prompt the user to pick an agent before composing.
      const seedAgent = agentId ?? defaultAgentId;
      if (!seedAgent) {
        set({ sessions: [], currentSessionId: null, messages: [] });
        return;
      }
      const now = Date.now();
      const fresh: ChatSession = {
        id: generateId(),
        agentId: seedAgent,
        title: 'New chat',
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };
      persistSession(walletAddress, fresh);
      set({ sessions: [fresh], currentSessionId: fresh.id, messages: [] });
      return;
    }
    if (currentSessionId === sessionId) {
      const next = remaining[0];
      set({ sessions: remaining, currentSessionId: next.id, messages: [], isLoading: true });
      try {
        const messages = await loadSessionMessages(walletAddress, next.id);
        set({ messages, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ sessions: remaining });
    }
  },

  addMessage: (message) => {
    const { walletAddress, currentSessionId, sessions, messages } = get();
    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };
    set({ messages: [...messages, newMessage] });

    if (!walletAddress || !currentSessionId) return newMessage.id;
    // Take agentId from the session itself — that's the source of truth in
    // wallet mode where multiple sessions across different agents share one
    // sidebar.
    const session0 = sessions.find((s) => s.id === currentSessionId);
    if (!session0) return newMessage.id;

    saveMessage(walletAddress, session0.agentId, currentSessionId, newMessage).catch((err) =>
      console.warn('[ChatStore] Failed to persist message:', err),
    );

    // Title + summary fields. Auto-title from the first user message in the
    // session so the sidebar entry stops reading "New chat" the moment the
    // conversation has any signal. Gate on `title === 'New chat'` (not just
    // the messages snapshot) so a back-to-back double-submit can't re-title
    // a session whose title was already derived from the previous prompt.
    const session = session0;
    const isFirstUserMessage =
      message.role === 'user' &&
      session.title === 'New chat' &&
      !messages.some((m) => m.role === 'user');
    const nextTitle = isFirstUserMessage
      ? generateSessionTitle(message.content)
      : session.title;
    const updated: ChatSession = {
      ...session,
      title: nextTitle,
      updatedAt: newMessage.timestamp,
      messageCount: session.messageCount + 1,
    };
    persistSession(walletAddress, updated);
    set((s) => ({
      sessions: [updated, ...s.sessions.filter((x) => x.id !== updated.id)],
    }));
    return newMessage.id;
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
    const { walletAddress, currentSessionId, sessions, messages } = get();
    const updated = messages.find((m) => m.id === id);
    const session = sessions.find((s) => s.id === currentSessionId);
    if (walletAddress && session && currentSessionId && updated) {
      saveMessage(walletAddress, session.agentId, currentSessionId, updated).catch((err) =>
        console.warn('[ChatStore] Failed to persist updated message:', err),
      );
    }
  },

  setDefaultAgentId: (agentId) => {
    set({ defaultAgentId: agentId });
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
    saveSettings({ selectedModel: model });
  },

  reset: () => {
    closeDatabase();
    set({ ...initial, selectedModel: loadSettings().selectedModel });
  },
}));
