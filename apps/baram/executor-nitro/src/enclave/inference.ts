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
 * AI provider type
 */
type AIProvider = 'openai' | 'groq';

/**
 * Model configuration with provider routing
 */
interface ModelConfig {
  provider: AIProvider;
  maxTokens: number;
  systemPrompt: string;
}

/**
 * Supported models and their configurations
 */
const MODEL_CONFIG: Record<string, ModelConfig> = {
  'gpt-4o': {
    provider: 'openai',
    maxTokens: 2048,
    systemPrompt: 'You are a helpful assistant. Respond concisely and accurately.',
  },
  'llama-3.1-8b-instant': {
    provider: 'groq',
    maxTokens: 2048,
    systemPrompt: 'You are a helpful assistant. Respond concisely and accurately.',
  },
  'llama-3.3-70b-versatile': {
    provider: 'groq',
    maxTokens: 8192,
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

// AI provider clients - initialized lazily (direct mode only)
const aiClients: Record<string, OpenAI> = {};

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
 * Supports multiple AI providers (OpenAI, Groq).
 * At least one provider key is required.
 */
export function initializeInference(config: {
  openaiKey?: string;
  groqKey?: string;
}): void {
  if (config.openaiKey) {
    aiClients['openai'] = new OpenAI({ apiKey: config.openaiKey });
    console.log('[Enclave/Inference] OpenAI client initialized');
  }
  if (config.groqKey) {
    aiClients['groq'] = new OpenAI({
      apiKey: config.groqKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    console.log('[Enclave/Inference] Groq client initialized');
  }

  if (Object.keys(aiClients).length === 0) {
    throw new Error('At least one AI provider key is required (OPENAI_API_KEY or GROQ_API_KEY)');
  }

  isProxyMode = false;
  inferenceMode = 'direct';

  console.log(`[Enclave/Inference] Direct mode initialized (providers: ${Object.keys(aiClients).join(', ')})`);
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
 * Execute inference directly via AI provider API (local simulation)
 */
async function executeDirect(
  prompt: string,
  model: string,
  config: ModelConfig,
  startTime: number
): Promise<InferenceResult> {
  const client = aiClients[config.provider];
  if (!client) {
    throw new Error(`Provider not initialized: ${config.provider}. Available: ${Object.keys(aiClients).join(', ')}`);
  }

  try {
    const response = await client.chat.completions.create({
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

    console.log(`[Enclave/Inference] Direct inference completed in ${executionTimeMs}ms (provider: ${config.provider})`);

    return {
      result,
      resultHash,
      executionTimeMs,
      model,
      tokensUsed,
    };
  } catch (error) {
    console.error(`[Enclave/Inference] Direct inference failed (provider: ${config.provider}):`, error);

    if (error instanceof OpenAI.APIError) {
      throw new Error(`${config.provider} API error: ${error.message}`);
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
  config: ModelConfig,
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
      return Object.keys(aiClients).length > 0;
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

/**
 * Get the provider for a given model
 */
export function getProviderForModel(model: string): AIProvider | null {
  return MODEL_CONFIG[model]?.provider ?? null;
}

// Re-export types and functions for convenience
export type { LocalLLMConfig };
export { unloadModel };
