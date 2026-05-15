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
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createHash } from 'crypto';
import { initGroq, generateCompletion, isValidModel, getSupportedModels } from './services/ai';
import { initSui, verifyRequest, submitProofWithAER, getExecutorAddress, getExecutorStats, type AERReportData } from './services/sui';
import { initResultStore, saveResult, getResult } from './services/resultStore';
import { ExecuteRequest, ExecuteResponse, RecordRequest, RecordResponse, ResultRequest, DEFAULT_MODEL } from './types';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

// AWS Secrets Manager client (executor private key only)
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
// SSM client. Groq API key is an SSM SecureString. Cheaper than Secrets Manager for
// outbound API keys that do not carry asset-bearing risk.
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

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

  const sensitiveFields = ['encryptedPrompt', 'prompt', 'privateKey', 'apiKey', 'secret', 'result', 'signature', 'ephemeralPubKey'];

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

  // Load Groq API key from SSM Parameter Store (SecureString).
  const groqParameterName = process.env.GROQ_PARAMETER_NAME || '/baram/groq-api-key';
  const groqParam = await ssmClient.send(
    new GetParameterCommand({ Name: groqParameterName, WithDecryption: true })
  );
  const groqValue = groqParam.Parameter?.Value;
  if (!groqValue) {
    throw new Error(`SSM parameter '${groqParameterName}' returned no value`);
  }
  groqApiKey = groqValue;
  console.log('[Secrets] Groq API key loaded from SSM');

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

  // Initialize DynamoDB result store (if configured)
  if (process.env.RESULT_TABLE_NAME) {
    initResultStore({ tableName: process.env.RESULT_TABLE_NAME });
  }

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

  // /record input validation
  if (msg.includes('Result too short') || msg.includes('Result too long')) {
    return { status: 400, message: 'Invalid result length (50-10,000 chars required)' };
  }

  // On-chain verification issues
  if (msg.includes('Executor mismatch')) {
    return { status: 400, message: 'Executor assignment mismatch. This request is assigned to a different executor.' };
  }
  if (msg.includes('Request not found')) {
    return { status: 400, message: 'Request not found on-chain. It may have expired or been cancelled.' };
  }
  if (msg.includes('already completed') || msg.includes('already cancelled') || msg.includes('status is not PENDING')) {
    return { status: 409, message: 'Request has already been completed or cancelled.' };
  }

  // RPC / network issues
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
    return { status: 502, message: 'Network error connecting to blockchain RPC. Please try again later.' };
  }

  return { status: 500, message: 'Internal server error' };
}

// Maximum age for result request signatures (5 minutes)
const RESULT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Verify wallet ownership for result retrieval.
 * Throws descriptive error on failure (caller maps to generic 403).
 */
async function verifyResultOwnership(req: ResultRequest, expectedAddress: string): Promise<void> {
  // Validate timestamp freshness (replay protection)
  const age = Date.now() - req.timestamp;
  if (age < 0 || age > RESULT_SIGNATURE_MAX_AGE_MS) {
    throw new Error('TIMESTAMP_EXPIRED');
  }

  // Reconstruct the signed message
  const message = new TextEncoder().encode(
    `baram:view-result:${req.requestId}:${req.timestamp}`
  );

  if (req.signerType === 'standard') {
    // Full verification: SDK verifies signature and checks address match (throws on failure)
    await verifyPersonalMessageSignature(message, req.signature, { address: expectedAddress });
  } else if (req.signerType === 'zklogin') {
    // Partial verification: verify ephemeral key signature
    // Cannot fully bind ephemeral key to zkLogin address without ZK proof verification
    if (!req.ephemeralPubKey) {
      throw new Error('MISSING_EPHEMERAL_KEY');
    }
    const pubKey = new Ed25519PublicKey(Buffer.from(req.ephemeralPubKey, 'base64'));
    const isValid = await pubKey.verify(message, Buffer.from(req.signature, 'base64'));
    if (!isValid) {
      throw new Error('INVALID_SIGNATURE');
    }
    // Address check: client must provide the correct address
    if (req.address !== expectedAddress) {
      throw new Error('ADDRESS_MISMATCH');
    }
  } else {
    throw new Error('UNSUPPORTED_SIGNER_TYPE');
  }
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
    purpose: 'lambda_verified',
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

    // Store result text in DynamoDB (fire-and-forget)
    try {
      await saveResult({
        requestId,
        requesterAddress: verification.request!.requester,
        result,
        resultHash,
        model: body.model || DEFAULT_MODEL,
        purpose: 'lambda_verified',
      });
    } catch (e) {
      console.warn('[Execute] SAVE_FAILED', { requestId, error: (e as Error).message });
    }

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
 * Handle record request (Model B: self-reported LLM results)
 * Lambda performs settlement only — no AI inference.
 */
async function handleRecord(body: RecordRequest): Promise<RecordResponse> {
  const { requestId, result, promptHash, executionTimeMs = 0 } = body;

  console.log(`[Record] Processing request ${requestId}`);

  // Validate result length (50–10,000 chars)
  if (result.length < 50) {
    throw new Error('Result too short: minimum 50 characters required');
  }
  if (result.length > 10_000) {
    throw new Error('Result too long: maximum 10,000 characters allowed');
  }

  // Validate promptHash format
  if (!/^[0-9a-f]{64}$/i.test(promptHash)) {
    return {
      success: false,
      requestId,
      error: 'promptHash must be a 64-character hex string (SHA-256)',
    };
  }

  // Validate executionTimeMs
  if (executionTimeMs < 0 || !Number.isFinite(executionTimeMs)) {
    return {
      success: false,
      requestId,
      error: 'executionTimeMs must be a non-negative number',
    };
  }

  // Verify request on-chain
  const verification = await verifyRequest(requestId, promptHash);
  if (!verification.valid) {
    return {
      success: false,
      requestId,
      error: verification.error,
    };
  }

  console.log(`[Record] Request verified, executor: ${getExecutorAddress()}`);

  // Generate result hash
  const resultHash = sha256(result);

  // Submit proof + AER on-chain
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
    purpose: 'self_reported',
    constraints: null,
    executorTier: executorStats.tier,
    executorReputation: executorStats.reputation,
    executorStakeAmount: executorStats.stakeAmount,
    teeVerified: false,
    teeAttestationHash: null,
    triggeredBy: null,
    triggeredAction: null,
  };

  try {
    const txDigest = await submitProofWithAER(
      requestId, resultHash, executionTimeMs, verification.request!, aerData,
    );

    console.log(`[Record] Proof + AER submitted, tx: ${txDigest}`);

    // Store result text in DynamoDB (fire-and-forget)
    try {
      await saveResult({
        requestId,
        requesterAddress: verification.request!.requester,
        result,
        resultHash,
        model: verification.request!.model || 'unknown',
        purpose: 'self_reported',
      });
    } catch (e) {
      console.warn('[Record] SAVE_FAILED', { requestId, error: (e as Error).message });
    }

    return {
      success: true,
      requestId,
      resultHash,
      txDigest,
    };
  } catch (err) {
    const e = err as Error;
    console.error('[Record] Proof submission failed:', e.message);
    const classified = classifyError(e);
    return {
      success: false,
      requestId,
      error: classified.message,
      _httpStatus: classified.status,
    } as RecordResponse;
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

    // POST /record (Model B: self-reported settlement)
    if (path.endsWith('/record') && event.httpMethod === 'POST') {
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

      const body = parsed as RecordRequest;

      if (!isSafeRequestId(body.requestId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'requestId must be a non-negative integer' }),
        };
      }

      if (!body.result || typeof body.result !== 'string') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing or invalid result' }),
        };
      }

      if (!body.promptHash || typeof body.promptHash !== 'string') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing or invalid promptHash' }),
        };
      }

      const response = await handleRecord(body);

      // Use _httpStatus from handleRecord's classifyError (settlement errors: 409, 503, etc.)
      // Validation errors (no _httpStatus) default to 400
      const { _httpStatus, ...publicResponse } = response as RecordResponse & { _httpStatus?: number };
      const statusCode = response.success ? 200 : (_httpStatus ?? 400);
      return {
        statusCode,
        headers: corsHeaders,
        body: JSON.stringify(publicResponse),
      };
    }

    // GET /result?requestId=N&authorizer=0x... (DEPRECATED — use POST /result)
    if (path.endsWith('/result') && event.httpMethod === 'GET') {
      console.warn('[DEPRECATED] GET /result used — migrate to POST /result with wallet signature');

      const qp = event.queryStringParameters || {};
      const requestId = Number(qp.requestId);
      const authorizer = qp.authorizer || '';

      if (!isSafeRequestId(requestId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'requestId query parameter required (non-negative integer)' }),
        };
      }

      if (!/^0x[0-9a-fA-F]{64}$/.test(authorizer)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'authorizer query parameter required (valid Sui address)' }),
        };
      }

      const record = await getResult(requestId);

      if (!record || record.requesterAddress !== authorizer) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Result not found or expired' }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          requestId: record.requestId,
          result: record.result,
          resultHash: record.resultHash,
          model: record.model,
          purpose: record.purpose,
          createdAt: record.createdAt,
          expiresAt: record.ttl * 1000,
        }),
      };
    }

    // POST /result — authenticated result retrieval with wallet signature
    if (path.endsWith('/result') && event.httpMethod === 'POST') {
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

      const body = parsed as ResultRequest;

      // Input validation
      if (!isSafeRequestId(body.requestId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'requestId must be a non-negative integer' }),
        };
      }

      if (typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'timestamp must be a number' }),
        };
      }

      if (!body.signature || typeof body.signature !== 'string' || body.signature.length > 512) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'signature is required and must be under 512 characters' }),
        };
      }

      if (body.ephemeralPubKey && (typeof body.ephemeralPubKey !== 'string' || body.ephemeralPubKey.length > 256)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'ephemeralPubKey must be under 256 characters' }),
        };
      }

      if (!/^0x[0-9a-fA-F]{64}$/.test(body.address)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'address must be a valid Sui address' }),
        };
      }

      if (body.signerType !== 'standard' && body.signerType !== 'zklogin') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'signerType must be "standard" or "zklogin"' }),
        };
      }

      // Fetch stored result
      const record = await getResult(body.requestId);
      if (!record) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Result not found or expired' }),
        };
      }

      // Verify ownership via wallet signature
      try {
        await verifyResultOwnership(body, record.requesterAddress);
      } catch (err) {
        console.warn('[POST /result] Verification failed:', (err as Error).message, {
          requestId: body.requestId,
          address: body.address,
          signerType: body.signerType,
        });
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Access denied' }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          requestId: record.requestId,
          result: record.result,
          resultHash: record.resultHash,
          model: record.model,
          purpose: record.purpose,
          createdAt: record.createdAt,
          expiresAt: record.ttl * 1000,
        }),
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
