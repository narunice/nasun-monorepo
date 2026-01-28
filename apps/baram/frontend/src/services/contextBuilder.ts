/**
 * Context Builder - Build TEE context from chat history
 *
 * TEE is stateless, so we need to include previous messages
 * in each request for conversation context.
 *
 * Token limits:
 * - Llama 3.2 3B: ~4K context
 * - We target ~2500 tokens for history (leaving room for response)
 */

import type { Message, TeeContext, ContextConfig } from '../types/chat';

// Default configuration
const DEFAULT_CONFIG: ContextConfig = {
  maxRecentMessages: 10,
  maxTotalTokens: 2500,
  includeSystemPrompt: true,
};

// Approximate token count (rough estimate: 4 chars = 1 token)
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Build TEE context from message history
 *
 * Strategy:
 * 1. Take most recent N messages
 * 2. Trim if exceeds token budget
 * 3. Add optional system prompt
 */
export function buildTeeContext(
  messages: Message[],
  config: Partial<ContextConfig> = {}
): TeeContext {
  const { maxRecentMessages, maxTotalTokens, includeSystemPrompt } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Get recent messages (user and assistant only)
  const relevantMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxRecentMessages);

  // Build context messages with token budget
  const contextMessages: TeeContext['messages'] = [];
  let totalTokens = 0;

  // Add messages from oldest to newest, stopping when budget exceeded
  for (const msg of relevantMessages) {
    const tokens = estimateTokens(msg.content);

    if (totalTokens + tokens > maxTotalTokens) {
      // If this is the first message (current prompt), include it anyway
      if (contextMessages.length === 0) {
        contextMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
      break;
    }

    contextMessages.push({
      role: msg.role,
      content: msg.content,
    });
    totalTokens += tokens;
  }

  // Default system prompt
  const systemPrompt = includeSystemPrompt
    ? 'You are a helpful AI assistant. Respond concisely and accurately.'
    : undefined;

  return {
    messages: contextMessages,
    systemPrompt,
  };
}

/**
 * Build context for a new prompt, including the prompt itself
 */
export function buildContextWithPrompt(
  previousMessages: Message[],
  newPrompt: string,
  config: Partial<ContextConfig> = {}
): TeeContext {
  // Add the new prompt as a temporary message
  const tempMessage: Message = {
    id: 'temp',
    role: 'user',
    content: newPrompt,
    timestamp: Date.now(),
  };

  return buildTeeContext([...previousMessages, tempMessage], config);
}

/**
 * Format context for TEE request
 * Returns a single formatted string for encryption
 */
export function formatContextForTee(context: TeeContext): string {
  const parts: string[] = [];

  // Add system prompt if present
  if (context.systemPrompt) {
    parts.push(`System: ${context.systemPrompt}`);
  }

  // Add conversation history
  for (const msg of context.messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    parts.push(`${role}: ${msg.content}`);
  }

  return parts.join('\n\n');
}

/**
 * Get context statistics for debugging/display
 */
export function getContextStats(context: TeeContext): {
  messageCount: number;
  estimatedTokens: number;
  hasSystemPrompt: boolean;
} {
  let totalTokens = 0;

  if (context.systemPrompt) {
    totalTokens += estimateTokens(context.systemPrompt);
  }

  for (const msg of context.messages) {
    totalTokens += estimateTokens(msg.content);
  }

  return {
    messageCount: context.messages.length,
    estimatedTokens: totalTokens,
    hasSystemPrompt: !!context.systemPrompt,
  };
}
