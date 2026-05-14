/**
 * Build TEE conversation context from prior chat messages.
 *
 * The TEE executor is stateless so we attach the last N messages with a
 * ~2500-token budget on each request. Adapted verbatim from baram.
 */

import type { Message, TeeContext, ContextConfig } from '../types/chat';

const DEFAULT_CONFIG: ContextConfig = {
  maxRecentMessages: 10,
  maxTotalTokens: 2500,
  includeSystemPrompt: true,
};

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function buildTeeContext(
  messages: Message[],
  config: Partial<ContextConfig> = {},
): TeeContext {
  const { maxRecentMessages, maxTotalTokens, includeSystemPrompt } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const relevant = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.failed)
    .slice(-maxRecentMessages);

  const contextMessages: TeeContext['messages'] = [];
  let total = 0;

  for (const msg of relevant) {
    const tokens = estimateTokens(msg.content);
    if (total + tokens > maxTotalTokens) {
      if (contextMessages.length === 0) {
        contextMessages.push({ role: msg.role, content: msg.content });
      }
      break;
    }
    contextMessages.push({ role: msg.role, content: msg.content });
    total += tokens;
  }

  return {
    messages: contextMessages,
    systemPrompt: includeSystemPrompt
      ? 'You are a helpful AI assistant. Respond concisely and accurately.'
      : undefined,
  };
}

export function buildContextWithPrompt(
  previousMessages: Message[],
  newPrompt: string,
  config: Partial<ContextConfig> = {},
): TeeContext {
  const tempMessage: Message = {
    id: 'temp',
    role: 'user',
    content: newPrompt,
    timestamp: Date.now(),
  };
  return buildTeeContext([...previousMessages, tempMessage], config);
}

export function formatContextForTee(context: TeeContext): string {
  const parts: string[] = [];
  if (context.systemPrompt) parts.push(`System: ${context.systemPrompt}`);
  for (const msg of context.messages) {
    parts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
  }
  return parts.join('\n\n');
}
