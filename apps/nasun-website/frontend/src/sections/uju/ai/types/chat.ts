/**
 * Chat types for the per-agent Nasun AI chat surface.
 *
 * Adapted from baram/frontend/src/types/chat.ts — scoped per (wallet, agent)
 * instead of per-wallet, and trimmed to the single-session model that the
 * AgentDetail sub-tab uses (no multi-session list, no privacy-mode duality).
 */

export type MessageRole = 'user' | 'assistant' | 'system';

/** Internal data-model discriminator — never surfaced as a UI toggle.
 * Generic = top-level "AI Chat" tab (legacy useRequestWithRetry / executor).
 * Agent   = wake-mode chat inside an agent's detail page sub-tab. */
export type SessionKind = 'generic' | 'agent';

export interface MessageMetadata {
  requestId?: number;
  executionTimeMs?: number;
  teeVerified?: boolean;
  txDigest?: string;
  resultHash?: string;
  teeType?: number;
  pcr0?: string;
  attestationVerified?: boolean;
}

// Wake-mode proposal artifact echoed back in the assistant turn.
// Shape mirrors `Proposal` from @nasun/baram-sdk's proposal.ts, kept loose
// here so frontend doesn't need a zod dep just to read fields.
export interface WakeProposal {
  proposal_id: string;
  intent_id: string;
  action_type: string;
  summary: string;
  side: 'BUY' | 'SELL';
  symbol: string;
  size_quote_raw: string;
  max_slippage_bps: number;
  confidence: number;
  expires_at: string;
  /** Optional Telegram deep link. Server may add later; if absent, frontend
   * falls back to `https://t.me/nasun_ai_bot?start=proposal_{id}`. */
  tgDeepLink?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: MessageMetadata;
  failed?: boolean;
  /** Wake-mode assistant turn may attach a proposal artifact. Rendered as a
   * structured card with countdown + "Open in Telegram" CTA. */
  proposal?: WakeProposal;
  /** Reason code from chatWakeReasons whitelist when a turn fails. */
  wakeReason?: string;
  /** Retry control for wake-mode failures. true → render Retry button, which
   * re-submits with a fresh idempotencyKey. */
  retryable?: boolean;
  /** Phase indicator while a wake job is in flight. Drives the soft/hard wait
   * copy in AssistantMessage. */
  wakePhase?: 'submitting' | 'pending' | 'soft-wait' | 'hard-wait' | 'timeout';
  /** Wake job id when the assistant message is the placeholder for an
   * in-flight job. Used to resume polling across remounts. */
  wakeJobId?: string;
}

export interface EncryptedMessage {
  id: string;
  agentId: string;
  /** Session this message belongs to. Optional for back-compat with v1 records
   * stored before the multi-session schema; the loader migrates such rows into
   * a synthetic "Imported chat" session on first read. */
  sessionId?: string;
  encrypted: string;
  iv: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** Internal kind discriminator. Undefined on v2 rows; loader defaults to
   * 'generic'. Used by ChatView / AgentChat to filter their respective lists. */
  sessionKind?: SessionKind;
  /** Capability id this session is bound to when kind='agent'. Captured at
   * session creation so a wake job can scope its chatToken to a stable cap. */
  capabilityId?: string;
}

/**
 * In-flight wake job persisted plaintext to IndexedDB so a tab close/reopen
 * or refresh can resume polling instead of leaking a Budget charge. Keyed by
 * sessionId — at most one in-flight job per session at a time, since the user
 * can only have one Send click pending per chat thread.
 */
export interface InflightWakeJob {
  sessionId: string;
  agentId: string;
  /** Set after POST /wake returns. Null while we're still leasing/submitting,
   * so a refresh during that narrow window simply discards the row. */
  jobId: string | null;
  idempotencyKey: string;
  /** SHA-256-shaped hash of the message body the user is waiting on. Used
   * only as a safety check on resume — if a resumed row's hash mismatches
   * the user's last message in storage, drop the row. */
  messageHash: string;
  /** Placeholder assistant message id created when the user clicked Send.
   * Lets resume find the row in messages and flip it to done/error. */
  placeholderMessageId: string;
  createdAt: number;
  /** Server-side TTL is 10 min; we mirror it here so a stale row gets
   * dropped on resume rather than re-polled into a 404. */
  expiresAt: number;
}

export interface EncryptedSession {
  id: string;
  agentId: string;
  encrypted: string;
  iv: string;
  updatedAt: number;
}

/** Derive a 30-char one-line title from the first user message. */
export function generateSessionTitle(firstUserMessage: string): string {
  const flat = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (!flat) return 'New chat';
  return flat.length > 30 ? `${flat.slice(0, 30)}...` : flat;
}

export interface TeeContext {
  messages: Array<{ role: MessageRole; content: string }>;
  systemPrompt?: string;
}

export interface ContextConfig {
  maxRecentMessages: number;
  maxTotalTokens: number;
  includeSystemPrompt: boolean;
}

export function generateId(): string {
  return crypto.randomUUID();
}
