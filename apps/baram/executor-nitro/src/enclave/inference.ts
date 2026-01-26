/**
 * Enclave AI Inference Module
 *
 * Handles AI inference within the Enclave using OpenAI API.
 *
 * Two modes of operation:
 *
 * 1. Direct Mode (local simulation):
 *    - Enclave calls OpenAI API directly
 *    - Requires OPENAI_API_KEY in Enclave environment
 *
 * 2. Proxy Mode (AWS Nitro):
 *    - Enclave has NO direct network access
 *    - Sends OPENAI_PROXY_REQUEST to Host via vsock
 *    - Host calls OpenAI and returns OPENAI_PROXY_RESPONSE
 *    - Decrypted prompt is visible to Host (security trade-off)
 */

import OpenAI from 'openai';
import { sha256 } from './crypto.js';
import { useOpenAIProxy, generateRequestId } from '../shared/protocol.js';
import {
  initializeLocalLLM,
  generateCompletion,
  isLocalLLMReady,
  unloadModel,
  type LocalLLMConfig,
} from './local-llm.js';

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

/**
 * Proxy function type for Host to call OpenAI on behalf of Enclave
 */
export interface OpenAIProxyFunction {
  (request: {
    proxyRequestId: string;
    model: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    success: boolean;
    result?: string;
    error?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
}

// OpenAI client - initialized lazily (direct mode only)
let openaiClient: OpenAI | null = null;

// Proxy function - set when in proxy mode
let proxyFunction: OpenAIProxyFunction | null = null;

// Operation mode: 'direct' | 'proxy' | 'local'
type InferenceMode = 'direct' | 'proxy' | 'local';
let inferenceMode: InferenceMode = 'direct';

// Legacy compatibility
let isProxyMode: boolean = false;

/**
 * Initialize the inference module for direct mode (local simulation)
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
  isProxyMode = false;
  inferenceMode = 'direct';

  console.log('[Enclave/Inference] OpenAI client initialized (direct mode)');
}

/**
 * Initialize the inference module for proxy mode (Nitro Enclave)
 *
 * @param proxy - Function to send proxy requests to Host
 */
export function initializeInferenceProxy(proxy: OpenAIProxyFunction): void {
  proxyFunction = proxy;
  isProxyMode = true;
  inferenceMode = 'proxy';

  console.log('[Enclave/Inference] Proxy mode initialized (Host will call OpenAI)');
}

/**
 * Initialize the inference module for local LLM mode (Nitro Enclave with privacy)
 *
 * This mode runs the LLM entirely within the Enclave.
 * Prompts NEVER leave the TEE - complete privacy protection.
 *
 * @param config - Local LLM configuration
 */
export async function initializeInferenceLocal(config?: LocalLLMConfig): Promise<void> {
  await initializeLocalLLM(config);
  inferenceMode = 'local';
  isProxyMode = false;

  console.log('[Enclave/Inference] Local LLM mode initialized (prompts stay in TEE)');
}

/**
 * Execute AI inference with the given prompt
 *
 * Automatically uses proxy mode if initialized with initializeInferenceProxy()
 *
 * @param prompt - Decrypted user prompt
 * @param model - Model ID to use
 * @returns Inference result with hash and timing
 */
export async function executeInference(
  prompt: string,
  model: string
): Promise<InferenceResult> {
  // Local mode uses its own model, skip config check
  if (inferenceMode === 'local') {
    const startTime = Date.now();
    console.log(`[Enclave/Inference] Executing inference with local LLM`);
    return executeLocal(prompt, startTime);
  }

  const config = MODEL_CONFIG[model];
  if (!config) {
    throw new Error(`Unsupported model: ${model}. Supported: ${Object.keys(MODEL_CONFIG).join(', ')}`);
  }

  const startTime = Date.now();
  console.log(`[Enclave/Inference] Executing inference with model: ${model} (${isProxyMode ? 'proxy' : 'direct'} mode)`);

  if (isProxyMode) {
    return executeViaProxy(prompt, model, config, startTime);
  } else {
    return executeDirect(prompt, model, config, startTime);
  }
}

/**
 * Execute inference directly via OpenAI API (local simulation)
 */
async function executeDirect(
  prompt: string,
  model: string,
  config: { maxTokens: number; systemPrompt: string },
  startTime: number
): Promise<InferenceResult> {
  if (!openaiClient) {
    throw new Error('Inference module not initialized (direct mode requires initializeInference)');
  }

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

    console.log(`[Enclave/Inference] Direct inference completed in ${executionTimeMs}ms`);

    return {
      result,
      resultHash,
      executionTimeMs,
      model,
      tokensUsed,
    };
  } catch (error) {
    console.error('[Enclave/Inference] Direct inference failed:', error);

    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }

    throw error;
  }
}

/**
 * Execute inference via Host proxy (Nitro Enclave)
 *
 * The Host will call OpenAI on behalf of the Enclave
 */
async function executeViaProxy(
  prompt: string,
  model: string,
  config: { maxTokens: number; systemPrompt: string },
  startTime: number
): Promise<InferenceResult> {
  if (!proxyFunction) {
    throw new Error('Inference module not initialized (proxy mode requires initializeInferenceProxy)');
  }

  const proxyRequestId = generateRequestId();

  // Combine system prompt and user prompt for the proxy
  const fullPrompt = `${config.systemPrompt}\n\nUser: ${prompt}`;

  console.log(`[Enclave/Inference] Sending proxy request ${proxyRequestId} to Host...`);

  try {
    const response = await proxyFunction({
      proxyRequestId,
      model,
      prompt: fullPrompt,
      maxTokens: config.maxTokens,
      temperature: 0.7,
    });

    if (!response.success) {
      throw new Error(response.error || 'Proxy request failed');
    }

    const executionTimeMs = Date.now() - startTime;
    const result = response.result || '';
    const resultHash = sha256(result);
    const tokensUsed = response.usage?.totalTokens || 0;

    console.log(`[Enclave/Inference] Proxy inference completed in ${executionTimeMs}ms`);

    return {
      result,
      resultHash,
      executionTimeMs,
      model,
      tokensUsed,
    };
  } catch (error) {
    console.error('[Enclave/Inference] Proxy inference failed:', error);
    throw error;
  }
}

/**
 * Execute inference using local LLM (complete privacy)
 *
 * The prompt is processed entirely within the Enclave.
 * No data leaves the TEE.
 */
async function executeLocal(prompt: string, startTime: number): Promise<InferenceResult> {
  try {
    const { result, tokensUsed } = await generateCompletion(prompt, {
      maxTokens: 512,
      temperature: 0.7,
    });

    const executionTimeMs = Date.now() - startTime;
    const resultHash = sha256(result);

    console.log(`[Enclave/Inference] Local inference completed in ${executionTimeMs}ms`);

    return {
      result,
      resultHash,
      executionTimeMs,
      model: 'llama-3.2-3b-local',
      tokensUsed,
    };
  } catch (error) {
    console.error('[Enclave/Inference] Local inference failed:', error);
    throw error;
  }
}

/**
 * Check if inference module is initialized
 */
export function isInferenceReady(): boolean {
  switch (inferenceMode) {
    case 'local':
      return isLocalLLMReady();
    case 'proxy':
      return proxyFunction !== null;
    case 'direct':
    default:
      return openaiClient !== null;
  }
}

/**
 * Check if running in proxy mode
 */
export function isInProxyMode(): boolean {
  return inferenceMode === 'proxy';
}

/**
 * Check if running in local LLM mode
 */
export function isInLocalMode(): boolean {
  return inferenceMode === 'local';
}

/**
 * Get current inference mode
 */
export function getInferenceMode(): InferenceMode {
  return inferenceMode;
}

/**
 * Get supported models
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_CONFIG);
}

// Re-export types and functions for convenience
export type { LocalLLMConfig };
export { unloadModel };
