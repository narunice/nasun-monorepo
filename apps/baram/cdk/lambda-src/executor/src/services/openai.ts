/**
 * OpenAI Service - AI completion wrapper
 */

import OpenAI from 'openai';
import { DEFAULT_MODEL } from '../types';

let openaiClient: OpenAI | null = null;

/**
 * Initialize OpenAI client
 */
export function initOpenAI(apiKey: string): void {
  openaiClient = new OpenAI({ apiKey });
}

/**
 * Get OpenAI client (must be initialized first)
 */
function getClient(): OpenAI {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Call initOpenAI() first.');
  }
  return openaiClient;
}

export interface CompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Generate AI completion
 *
 * @param prompt - User's prompt (decrypted)
 * @param model - OpenAI model ID (default: gpt-4o-mini)
 * @returns Completion result with token usage
 */
export async function generateCompletion(
  prompt: string,
  model: string = DEFAULT_MODEL
): Promise<CompletionResult> {
  const client = getClient();

  const startTime = Date.now();
  console.log(`[OpenAI] Starting completion with model: ${model}`);

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 2048,
    temperature: 0.7,
  });

  const elapsed = Date.now() - startTime;
  console.log(`[OpenAI] Completion finished in ${elapsed}ms`);

  const message = response.choices[0]?.message;
  if (!message?.content) {
    throw new Error('No content in OpenAI response');
  }

  return {
    content: message.content,
    model: response.model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}

/**
 * Validate model is supported
 */
export function isValidModel(model: string): boolean {
  const supportedModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  return supportedModels.includes(model);
}
