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
  encrypted: string;
  iv: string;
  timestamp: number;
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
