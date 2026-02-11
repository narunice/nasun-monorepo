/**
 * Baram Executor Lambda Handler
 *
 * Flow:
 * 1. Receive execute request with requestId and encrypted prompt
 * 2. Verify request exists on-chain and is valid
 * 3. Decrypt prompt (MVP: Base64 decode)
 * 4. Call Groq API
 * 5. Generate result hash
 * 6. Submit proof to chain (triggers automatic settlement)
 * 7. Return result to caller
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createHash } from 'crypto';
import { initGroq, generateCompletion, isValidModel, getSupportedModels } from './services/ai';
import { initSui, verifyRequest, submitProofWithAER, getExecutorAddress, getExecutorStats, type AERReportData } from './services/sui';
import { ExecuteRequest, ExecuteResponse, DEFAULT_MODEL } from './types';

// AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Cached secrets (cleared after initialization)
let groqApiKey: string | null = null;
let executorPrivateKey: string | null = null;
let initialized = false;

/**
 * Safely parse JSON without throwing — returns null on failure.
 */
function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Validate that a value is a non-negative safe integer.
 */
function isSafeRequestId(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Extract SecretString with explicit null check.
 */
function requireSecretString(secret: { SecretString?: string }, name: string): string {
  if (!secret.SecretString) {
    throw new Error(`Secret '${name}' is missing SecretString`);
  }
  return secret.SecretString;
}

// CORS — multi-origin support. Fail-secure: no header if unset.
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/**
 * Build CORS headers matching the request Origin against the allowlist.
 * Returns a static header set if the origin matches, empty otherwise.
 */
function buildCorsHeaders(requestOrigin?: string): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  if (requestOrigin && CORS_ALLOWED_ORIGINS.includes(requestOrigin)) {
    base['Access-Control-Allow-Origin'] = requestOrigin;
  }
  return base;
}

/**
 * Mask sensitive data before logging
 */
function maskSensitive<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  const sensitiveFields = ['encryptedPrompt', 'prompt', 'privateKey', 'apiKey', 'secret'];

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitive(item)) as T;
  }

  const masked = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
      masked[key] = '[REDACTED]';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitive(masked[key]);
    }
  }
  return masked as T;
}

/**
 * Load secrets from AWS Secrets Manager
 */
async function loadSecrets(): Promise<void> {
  if (initialized) return;

  // Load Groq API key
  const groqSecret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.GROQ_SECRET_NAME || 'baram/groq' })
  );
  const groqData = JSON.parse(requireSecretString(groqSecret, 'baram/groq'));
  groqApiKey = groqData.apiKey;
  console.log('[Secrets] Groq API key loaded');

  // Load executor private key
  const executorSecret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.EXECUTOR_SECRET_NAME || 'baram/executor' })
  );
  const executorData = JSON.parse(requireSecretString(executorSecret, 'baram/executor'));
  executorPrivateKey = executorData.privateKey;

  console.log('[Secrets] Loaded successfully');
}

/**
 * Initialize services (called once per Lambda cold start)
 */
async function initialize(): Promise<void> {
  if (initialized) return;

  await loadSecrets();

  // Initialize Groq
  initGroq(groqApiKey!);

  // Initialize Sui client
  initSui({
    rpcUrl: process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
    packageId: process.env.BARAM_PACKAGE_ID || '',
    registryId: process.env.BARAM_REGISTRY_ID || '',
    executorPrivateKey: executorPrivateKey!,
    aerPackageId: process.env.AER_PACKAGE_ID || '',
    aerRegistryId: process.env.AER_REGISTRY_ID || '',
    executorRegistryId: process.env.EXECUTOR_REGISTRY_ID || '',
  });

  // Clear raw secrets from memory — SDKs hold their own copies internally
  groqApiKey = null;
  executorPrivateKey = null;

  initialized = true;
  console.log('[Init] Services initialized');
}

/**
 * Decrypt prompt (MVP: Base64 decode)
 * Future: Implement proper decryption with TEE
 */
function decryptPrompt(encryptedPrompt: string): string {
  // MVP: Simple Base64 decode
  return Buffer.from(encryptedPrompt, 'base64').toString('utf-8');
}

/**
 * Generate SHA-256 hash of content
 */
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Classify error messages into user-actionable categories.
 */
function classifyError(err: Error): { status: number; message: string } {
  const msg = err.message || '';

  // Gas / funding issues
  if (msg.includes('No valid gas coins') || msg.includes('InsufficientGas') || msg.includes('Cannot find gas coin')) {
    return { status: 503, message: 'Executor wallet has insufficient gas. Please contact the operator.' };
  }

  // Groq API issues
  if (msg.includes('rate_limit') || msg.includes('429')) {
    return { status: 429, message: 'AI provider rate limit exceeded. Please try again later.' };
  }
  if (msg.includes('authentication') || msg.includes('401') || msg.includes('invalid_api_key')) {
    return { status: 502, message: 'AI provider authentication failed. Please contact the operator.' };
  }

  // On-chain verification issues
  if (msg.includes('Executor mismatch')) {
    return { status: 400, message: 'Executor assignment mismatch. This request is assigned to a different executor.' };
  }
  if (msg.includes('Request not found')) {
    return { status: 400, message: 'Request not found on-chain. It may have expired or been cancelled.' };
  }
  if (msg.includes('already completed') || msg.includes('already cancelled')) {
    return { status: 409, message: 'Request has already been completed or cancelled.' };
  }

  // RPC / network issues
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
    return { status: 502, message: 'Network error connecting to blockchain RPC. Please try again later.' };
  }

  return { status: 500, message: 'Internal server error' };
}

/**
 * Handle execute request
 */
async function handleExecute(body: ExecuteRequest): Promise<ExecuteResponse> {
  const { requestId, encryptedPrompt, model = DEFAULT_MODEL } = body;
  const startTime = Date.now();

  console.log(`[Execute] Processing request ${requestId} with model ${model}`);

  // Validate model
  if (!isValidModel(model)) {
    return {
      success: false,
      requestId,
      error: `Unsupported model: ${model}`,
    };
  }

  // Decrypt prompt
  const prompt = decryptPrompt(encryptedPrompt);
  const promptHash = sha256(prompt);

  console.log(`[Execute] Prompt hash: ${promptHash}`);

  // Verify request on-chain
  const verification = await verifyRequest(requestId, promptHash);
  if (!verification.valid) {
    return {
      success: false,
      requestId,
      error: verification.error,
    };
  }

  console.log(`[Execute] Request verified, executor: ${getExecutorAddress()}`);

  // Generate AI completion
  let completion;
  try {
    completion = await generateCompletion(prompt, model);
  } catch (err) {
    const e = err as Error;
    console.error('[Execute] AI completion failed:', e.message);
    const classified = classifyError(e);
    return {
      success: false,
      requestId,
      error: classified.message,
    };
  }

  const result = completion.content;
  const resultHash = sha256(result);

  console.log(`[Execute] Completion generated, tokens: ${completion.totalTokens}`);

  // Submit proof + AER on-chain
  const executionTimeMs = Date.now() - startTime;
  const executorAddress = getExecutorAddress();
  const executorStats = await getExecutorStats(executorAddress);

  const aerData: AERReportData = {
    initiator: verification.request!.requester,
    delegationPath: [],
    executorPrincipal: null,
    feeDetail: null,
    budgetId: null,
    budgetRemaining: null,
    modelMetadata: null,
    purpose: null,
    constraints: null,
    executorTier: executorStats.tier,
    executorReputation: executorStats.reputation,
    executorStakeAmount: executorStats.stakeAmount,
    teeVerified: false, // Lambda executor — no TEE
    teeAttestationHash: null,
    triggeredBy: null,
    triggeredAction: null,
  };

  try {
    const txDigest = await submitProofWithAER(
      requestId, resultHash, executionTimeMs, verification.request!, aerData,
    );

    console.log(`[Execute] Proof + AER submitted, tx: ${txDigest}`);

    return {
      success: true,
      requestId,
      result,
      resultHash,
      txDigest,
      executionTimeMs,
    };
  } catch (err) {
    const e = err as Error;
    console.error('[Execute] Proof submission failed:', e.message);
    const classified = classifyError(e);
    return {
      success: false,
      requestId,
      error: classified.message,
    };
  }
}

/**
 * Lambda handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'];
  const corsHeaders = buildCorsHeaders(origin);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // Log request safely (inside try/catch to handle malformed bodies)
    console.log('[Request]', {
      method: event.httpMethod,
      path: event.path,
      body: event.body ? maskSensitive(safeJsonParse(event.body)) : null,
    });

    // Initialize services
    await initialize();

    const path = event.path;

    // GET /health
    if (path.endsWith('/health') && event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          status: 'healthy',
          executor: getExecutorAddress(),
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // GET /info
    if (path.endsWith('/info') && event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          executor: getExecutorAddress(),
          packageId: process.env.BARAM_PACKAGE_ID,
          registryId: process.env.BARAM_REGISTRY_ID,
          supportedModels: getSupportedModels(),
          network: 'Nasun Devnet',
        }),
      };
    }

    // POST /execute
    if (path.endsWith('/execute') && event.httpMethod === 'POST') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Request body is required' }),
        };
      }

      const parsed = safeJsonParse(event.body);
      if (!parsed || typeof parsed !== 'object') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }

      const body = parsed as ExecuteRequest;

      if (!isSafeRequestId(body.requestId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'requestId must be a non-negative integer' }),
        };
      }

      if (!body.encryptedPrompt || typeof body.encryptedPrompt !== 'string') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing or invalid encryptedPrompt' }),
        };
      }

      // Reject oversized prompts (1MB Base64 ~ 750KB raw)
      const MAX_PROMPT_SIZE = 1 * 1024 * 1024;
      if (body.encryptedPrompt.length > MAX_PROMPT_SIZE) {
        return {
          statusCode: 413,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Encrypted prompt too large' }),
        };
      }

      const response = await handleExecute(body);

      return {
        statusCode: response.success ? 200 : 400,
        headers: corsHeaders,
        body: JSON.stringify(response),
      };
    }

    // 404
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Error]', err.message, err.stack);

    const classified = classifyError(err);
    return {
      statusCode: classified.status,
      headers: corsHeaders,
      body: JSON.stringify({ error: classified.message }),
    };
  }
};
