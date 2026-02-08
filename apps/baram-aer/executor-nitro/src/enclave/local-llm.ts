/**
 * Local LLM Module for Enclave
 *
 * Runs LLM inference entirely within the Enclave using llama.cpp.
 * This ensures prompts NEVER leave the TEE - complete privacy protection.
 *
 * Uses node-llama-cpp for TypeScript bindings to llama.cpp.
 */

import { getLlama, LlamaChatSession, type LlamaModel, type LlamaContext } from 'node-llama-cpp';

const DEFAULT_MODEL_PATH = '/app/models/llama-3.2-3b-instruct-q4_k_m.gguf';

let llama: Awaited<ReturnType<typeof getLlama>> | null = null;
let model: LlamaModel | null = null;
let context: LlamaContext | null = null;

/**
 * Configuration for local LLM initialization
 */
export interface LocalLLMConfig {
  modelPath?: string;
  contextSize?: number; // default: 2048
  threads?: number; // default: 2 (Enclave vCPU count)
}

/**
 * Result from local LLM completion
 */
export interface LocalLLMResult {
  result: string;
  tokensUsed: number;
}

/**
 * Initialize the local LLM
 *
 * Loads the GGUF model into memory. This is a heavy operation
 * that should only be done once on Enclave startup.
 *
 * @param config - Configuration options
 */
export async function initializeLocalLLM(config: LocalLLMConfig = {}): Promise<void> {
  const modelPath = config.modelPath || DEFAULT_MODEL_PATH;
  const contextSize = config.contextSize || 2048;
  const threads = config.threads || 2;

  console.log(`[LocalLLM] Loading model from ${modelPath}...`);
  console.log(`[LocalLLM] Config: contextSize=${contextSize}, threads=${threads}`);
  const startTime = Date.now();

  try {
    llama = await getLlama();

    model = await llama.loadModel({
      modelPath,
    });

    context = await model.createContext({
      contextSize,
    });

    const loadTime = Date.now() - startTime;
    console.log(`[LocalLLM] Model loaded successfully in ${loadTime}ms`);
  } catch (error) {
    console.error('[LocalLLM] Failed to load model:', error);
    throw new Error(`Failed to initialize local LLM: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a completion using the local LLM
 *
 * Creates a fresh context for each request to avoid sequence exhaustion issues.
 * This is slightly less efficient but ensures reliable operation.
 *
 * @param prompt - User prompt (already decrypted)
 * @param options - Generation options
 * @returns Generated text and token usage
 */
export async function generateCompletion(
  prompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  } = {}
): Promise<LocalLLMResult> {
  if (!model) {
    throw new Error('Local LLM not initialized. Call initializeLocalLLM() first.');
  }

  const maxTokens = options.maxTokens || 512;
  const temperature = options.temperature || 0.7;
  const systemPrompt =
    options.systemPrompt || 'You are a helpful assistant. Respond concisely and accurately.';

  console.log(`[LocalLLM] Generating completion (maxTokens=${maxTokens}, temp=${temperature})...`);
  const startTime = Date.now();

  // Create a fresh context for each request to avoid "No sequences left" error
  // This is more reliable than trying to reuse sequences
  let requestContext: LlamaContext | null = null;
  let session: LlamaChatSession | null = null;

  try {
    requestContext = await model.createContext({
      contextSize: 2048,
    });

    const sequence = requestContext.getSequence();

    session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt,
    });

    const response = await session.prompt(prompt, {
      maxTokens,
      temperature,
    });

    const genTime = Date.now() - startTime;
    console.log(`[LocalLLM] Completion generated in ${genTime}ms (${response.length} chars)`);

    // Estimate token count (rough approximation: ~4 chars per token)
    const tokensUsed = Math.ceil((prompt.length + response.length) / 4);

    return {
      result: response,
      tokensUsed,
    };
  } catch (error) {
    console.error('[LocalLLM] Generation failed:', error);
    throw new Error(`Local LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Clean up resources
    if (session) {
      session.dispose();
    }
    if (requestContext) {
      await requestContext.dispose();
    }
  }
}

/**
 * Check if the local LLM is initialized and ready
 */
export function isLocalLLMReady(): boolean {
  return model !== null && context !== null;
}

/**
 * Get model information
 */
export function getModelInfo(): { loaded: boolean; modelPath?: string } {
  if (!model) {
    return { loaded: false };
  }
  return {
    loaded: true,
    modelPath: DEFAULT_MODEL_PATH,
  };
}

/**
 * Unload the model and free memory
 *
 * Called during graceful shutdown
 */
export async function unloadModel(): Promise<void> {
  console.log('[LocalLLM] Unloading model...');

  if (context) {
    await context.dispose();
    context = null;
  }

  if (model) {
    await model.dispose();
    model = null;
  }

  if (llama) {
    await llama.dispose();
    llama = null;
  }

  console.log('[LocalLLM] Model unloaded');
}
