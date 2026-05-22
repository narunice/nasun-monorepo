/**
 * Chat types for the per-agent Nasun AI chat surface.
 *
 * Adapted from baram/frontend/src/types/chat.ts — scoped per (wallet, agent)
 * instead of per-wallet, and trimmed to the single-session model that the
 * AgentDetail sub-tab uses (no multi-session list, no privacy-mode duality).
 */

export type MessageRole = 'user' | 'assistant' | 'system';

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

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: MessageMetadata;
  failed?: boolean;
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
