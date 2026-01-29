/**
 * Baram Executor Lambda Handler
 *
 * Flow:
 * 1. Receive execute request with requestId and encrypted prompt
 * 2. Verify request exists on-chain and is valid
 * 3. Decrypt prompt (MVP: Base64 decode)
 * 4. Call OpenAI API
 * 5. Generate result hash
 * 6. Submit proof to chain (triggers automatic settlement)
 * 7. Return result to caller
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createHash } from 'crypto';
import { initOpenAI, initGroq, generateCompletion, isValidModel, getSupportedModels } from './services/ai';
import { initSui, verifyRequest, submitProof, markExecuting, getExecutorAddress } from './services/sui';
import { ExecuteRequest, ExecuteResponse, DEFAULT_MODEL } from './types';

// AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Cached secrets
let openaiApiKey: string | null = null;
let groqApiKey: string | null = null;
let executorPrivateKey: string | null = null;
let initialized = false;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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
  if (openaiApiKey && executorPrivateKey) return;

  // Load OpenAI API key
  const openaiSecret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.OPENAI_SECRET_NAME || 'baram/openai' })
  );
  const openaiData = JSON.parse(openaiSecret.SecretString!);
  openaiApiKey = openaiData.apiKey;

  // Load Groq API key (optional - for fallback)
  try {
    const groqSecret = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: process.env.GROQ_SECRET_NAME || 'baram/groq' })
    );
    const groqData = JSON.parse(groqSecret.SecretString!);
    groqApiKey = groqData.apiKey;
    console.log('[Secrets] Groq API key loaded');
  } catch (error) {
    console.warn('[Secrets] Groq API key not found (optional fallback)');
  }

  // Load executor private key
  const executorSecret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.EXECUTOR_SECRET_NAME || 'baram/executor' })
  );
  const executorData = JSON.parse(executorSecret.SecretString!);
  executorPrivateKey = executorData.privateKey;

  console.log('[Secrets] Loaded successfully');
}

/**
 * Initialize services (called once per Lambda cold start)
 */
async function initialize(): Promise<void> {
  if (initialized) return;

  await loadSecrets();

  // Initialize OpenAI
  initOpenAI(openaiApiKey!);

  // Initialize Groq (if available)
  if (groqApiKey) {
    initGroq(groqApiKey);
  }

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
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  console.log('[Request]', {
    method: event.httpMethod,
    path: event.path,
    body: event.body ? maskSensitive(JSON.parse(event.body)) : null,
  });

  try {
    // Initialize services
    await initialize();

    const path = event.path;

    // GET /health - Health check
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

    // GET /info - Executor info
    if (path.endsWith('/info') && event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          executor: getExecutorAddress(),
          packageId: process.env.BARAM_PACKAGE_ID,
          registryId: process.env.BARAM_REGISTRY_ID,
          supportedModels: getSupportedModels(),
          groqEnabled: !!groqApiKey,
          network: 'Nasun Devnet',
        }),
      };
    }

    // POST /execute - Execute AI request
    if (path.endsWith('/execute') && event.httpMethod === 'POST') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Request body is required' }),
        };
      }

      const body: ExecuteRequest = JSON.parse(event.body);

      if (!body.requestId || !body.encryptedPrompt) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Missing required fields: requestId, encryptedPrompt',
          }),
        };
      }

      const response = await handleExecute(body);

      return {
        statusCode: response.success ? 200 : 400,
        headers: corsHeaders,
        body: JSON.stringify(response),
      };
    }

    // 404 for unknown routes
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
      body: JSON.stringify({
        error: 'Internal server error',
        message: err.message,
      }),
    };
  }
};
