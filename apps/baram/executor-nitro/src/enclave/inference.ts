/**
 * Enclave AI Inference Module
 *
 * Handles AI inference within the Enclave using OpenAI API.
 *
 * Security Note:
 * In production Nitro Enclave:
 * - Enclave has NO direct network access
 * - All network calls go through vsock proxy to Host
 * - Host only sees encrypted traffic (TLS termination in Enclave)
 *
 * In local simulation:
 * - Direct HTTPS calls to OpenAI
 * - Same API interface
 */

import OpenAI from 'openai';
import { sha256 } from './crypto.js';

/**
 * Supported models and their configurations
 */
const MODEL_CONFIG: Record<string, { maxTokens: number; systemPrompt: string }> = {
  'gpt-4o-mini': {
    maxTokens: 1024,
    systemPrompt: 'You are a helpful assistant. Respond concisely and accurately.',
  },
  'gpt-4o': {
    maxTokens: 2048,
    systemPrompt: 'You are a helpful assistant. Respond concisely and accurately.',
  },
};

/**
 * Inference result from the Enclave
 */
export interface InferenceResult {
  result: string;
  resultHash: string;
  executionTimeMs: number;
  model: string;
  tokensUsed: number;
}

// OpenAI client - initialized lazily
let openaiClient: OpenAI | null = null;

/**
 * Initialize the inference module with OpenAI API key
 *
 * @param apiKey - OpenAI API key
 */
export function initializeInference(apiKey: string): void {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  openaiClient = new OpenAI({
    apiKey,
  });

  console.log('[Enclave/Inference] OpenAI client initialized');
}

/**
 * Execute AI inference with the given prompt
 *
 * @param prompt - Decrypted user prompt
 * @param model - Model ID to use
 * @returns Inference result with hash and timing
 */
export async function executeInference(
  prompt: string,
  model: string
): Promise<InferenceResult> {
  if (!openaiClient) {
    throw new Error('Inference module not initialized');
  }

  const config = MODEL_CONFIG[model];
  if (!config) {
    throw new Error(`Unsupported model: ${model}. Supported: ${Object.keys(MODEL_CONFIG).join(', ')}`);
  }

  const startTime = Date.now();

  console.log(`[Enclave/Inference] Executing inference with model: ${model}`);

  try {
    const response = await openaiClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: config.maxTokens,
      temperature: 0.7,
    });

    const executionTimeMs = Date.now() - startTime;
    const result = response.choices[0]?.message?.content || '';
    const resultHash = sha256(result);
    const tokensUsed = response.usage?.total_tokens || 0;

    console.log(`[Enclave/Inference] Inference completed in ${executionTimeMs}ms`);

    return {
      result,
      resultHash,
      executionTimeMs,
      model,
      tokensUsed,
    };
  } catch (error) {
    console.error('[Enclave/Inference] Inference failed:', error);

    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }

    throw error;
  }
}

/**
 * Check if inference module is initialized
 */
export function isInferenceReady(): boolean {
  return openaiClient !== null;
}

/**
 * Get supported models
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_CONFIG);
}
