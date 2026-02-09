/**
 * Baram Executor Lambda Handler
 *
 * Flow:
 * 1. Receive execute request with requestId and Base64-encoded prompt
 * 2. Verify request exists on-chain and is valid
 * 3. Decode prompt (Base64 — no E2E encryption in Standard mode)
 * 4. Call Groq API
 * 5. Generate result hash
 * 6. Submit proof to chain (triggers automatic settlement)
 * 7. Return result to caller
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createHash } from 'crypto';
import { initGroq, generateCompletion, isValidModel, getSupportedModels } from './services/ai';
import { initSui, verifyRequest, submitProof, markExecuting, getExecutorAddress } from './services/sui';
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
    compliancePackageId: process.env.COMPLIANCE_PACKAGE_ID || '',
    complianceRegistryId: process.env.COMPLIANCE_REGISTRY_ID || '',
    executorRegistryId: process.env.EXECUTOR_REGISTRY_ID || '',
  });

  // Clear raw secrets from memory — SDKs hold their own copies internally
  groqApiKey = null;
  executorPrivateKey = null;

  initialized = true;
  console.log('[Init] Services initialized');
}

/**
 * Decode Base64-encoded prompt.
 *
 * Standard (Lambda) mode does NOT provide E2E encryption — prompts are
 * Base64-encoded by the SDK/frontend and protected only by HTTPS in transit.
 * For end-to-end privacy, use a TEE-enabled executor (Nitro Enclave).
 */
function decodePrompt(encodedPrompt: string): string {
  return Buffer.from(encodedPrompt, 'base64').toString('utf-8');
}

/**
 * Generate SHA-256 hash of content
 */
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
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

  // Decode Base64 prompt (Standard mode — no E2E encryption, HTTPS only)
  const prompt = decodePrompt(encryptedPrompt);
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

  // Mark request as executing (optional - for status tracking)
  try {
    await markExecuting(requestId);
  } catch (error) {
    // Non-fatal: status might already be EXECUTING
    console.warn('[Execute] Failed to mark as executing (continuing):', error);
  }

  // Generate AI completion
  const completion = await generateCompletion(prompt, model);
  const result = completion.content;
  const resultHash = sha256(result);

  console.log(`[Execute] Completion generated, tokens: ${completion.totalTokens}`);

  // Submit proof on-chain
  const executionTimeMs = Date.now() - startTime;
  const txDigest = await submitProof(requestId, resultHash, executionTimeMs);

  console.log(`[Execute] Proof submitted, tx: ${txDigest}`);

  return {
    success: true,
    requestId,
    result,
    resultHash,
    txDigest,
    executionTimeMs,
  };
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

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
