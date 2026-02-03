/**
 * Chat Types for Baram
 *
 * Defines the structure for messages, sessions, and encrypted storage.
 */

// Message role types
export type MessageRole = 'user' | 'assistant' | 'system';

// Message metadata from TEE execution
export interface MessageMetadata {
  requestId?: number;
  executionTimeMs?: number;
  teeVerified?: boolean;
  txDigest?: string;
  resultHash?: string;
  // TEE attestation data (for local compliance record display)
  teeType?: number;
  pcr0?: string;
  attestationVerified?: boolean;
}

// Single chat message
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number; // Unix timestamp for easier serialization
  metadata?: MessageMetadata;
  failed?: boolean; // true if request processing failed (user messages only)
}

// Chat session (conversation thread)
export interface ChatSession {
  id: string;
  title: string; // Auto-generated from first message
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  // Messages are stored separately, referenced by sessionId
}

// Encrypted message for storage
export interface EncryptedMessage {
  id: string;
  sessionId: string;
  encrypted: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded IV
  timestamp: number;
}

// Encrypted session for storage
export interface EncryptedSession {
  id: string;
  encrypted: string;
  iv: string;
  updatedAt: number;
}

// Context sent to TEE (includes previous messages)
export interface TeeContext {
  messages: Array<{
    role: MessageRole;
    content: string;
  }>;
  systemPrompt?: string;
}

// Context builder configuration
export interface ContextConfig {
  maxRecentMessages: number; // Default: 10
  maxTotalTokens: number; // Default: 2500
  includeSystemPrompt: boolean;
}

// Chat store state
export interface ChatState {
  // Current session
  activeSessionId: string | null;
  messages: Message[];

  // All sessions (metadata only)
  sessions: ChatSession[];

  // Settings
  selectedExecutorId: string | null;
  selectedModel: string | null;

  // Loading states
  isLoading: boolean;
  isEncrypting: boolean;
}

// Chat store actions
export interface ChatActions {
  // Session management
  createSession: () => string;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  clearAllSessions: () => Promise<void>;

  // Message management
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;

  // Settings
  setSelectedExecutor: (executorId: string | null) => void;
  setSelectedModel: (model: string | null) => void;

  // Persistence
  loadFromStorage: (walletAddress: string, password?: string) => Promise<void>;
  saveToStorage: () => Promise<void>;

  // Reset
  reset: () => void;
}

// Combined store type
export type ChatStore = ChatState & ChatActions;

// Date group for session list
export type DateGroup = 'today' | 'yesterday' | 'previous7days' | 'older';

// Grouped sessions for UI
export interface GroupedSessions {
  today: ChatSession[];
  yesterday: ChatSession[];
  previous7days: ChatSession[];
  older: ChatSession[];
}

// Export utility to group sessions by date
export function groupSessionsByDate(sessions: ChatSession[]): GroupedSessions {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const previous7days = today - 7 * 24 * 60 * 60 * 1000;

  const grouped: GroupedSessions = {
    today: [],
    yesterday: [],
    previous7days: [],
    older: [],
  };

  for (const session of sessions) {
    if (session.createdAt >= today) {
      grouped.today.push(session);
    } else if (session.createdAt >= yesterday) {
      grouped.yesterday.push(session);
    } else if (session.createdAt >= previous7days) {
      grouped.previous7days.push(session);
    } else {
      grouped.older.push(session);
    }
  }

  // Sort each group by updatedAt (most recent first)
  for (const group of Object.values(grouped)) {
    group.sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt);
  }

  return grouped;
}

// Generate session title from first message
export function generateSessionTitle(firstMessage: string): string {
  const maxLength = 30;
  const cleaned = firstMessage.trim().replace(/\n/g, ' ');
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.substring(0, maxLength - 3) + '...';
}

// Generate unique ID
export function generateId(): string {
  return crypto.randomUUID();
}
