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
import { initProviders, generateCompletion, isValidModel, getSupportedModels } from './services/ai';
import { initSui, verifyRequest, submitProofWithAER, submitSwapPTBWithAER, getExecutorAddress, getExecutorStats, getCapabilityFields, getCapabilityFieldsFull, type AERReportData } from './services/sui';
import { initResultStore, saveResult, getResult } from './services/resultStore';
import {
  ExecuteRequest,
  ExecuteResponse,
  RecordRequest,
  RecordResponse,
  ResultRequest,
  DEFAULT_MODEL,
  type AerCapabilityFields,
  type InferRequest,
  type InferResponse,
  type ExecuteCapabilityRequest,
  type ExecuteCapabilityResponse,
  type ActionCallSpecWire,
  type EscrowBlock,
  type SpendBlock,
} from './types';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { verifySettleSig, type SettleSigFields } from './_shared/sig-verify';
import { canonicalJsonSha256, computeActionCallHash, sha256Hex0x, type ActionCallHashInput } from './_shared/canonical-hash';

// AWS Secrets Manager client (executor private key only)
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
// SSM client. Groq API key is an SSM SecureString. Cheaper than Secrets Manager for
// outbound API keys that do not carry asset-bearing risk.
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

// Cached secrets (cleared after initialization)
let providerApiKeys: Record<string, string | null> = {};
let executorPrivateKey: string | null = null;
let initialized = false;

// AI provider catalog → SSM parameter env var name. Missing env (or
// missing SSM value) silently skips that provider — the AI fallback
// chain narrows to whichever subset has keys. Groq stays the canonical
// default for backward-compat with `GROQ_PARAMETER_NAME`; others use a
// uniform `<provider>_PARAMETER_NAME` convention.
const AI_PROVIDER_SSM_ENV: Record<string, string> = {
  groq:       'GROQ_PARAMETER_NAME',
  cerebras:   'CEREBRAS_PARAMETER_NAME',
  openrouter: 'OPENROUTER_PARAMETER_NAME',
  together:   'TOGETHER_PARAMETER_NAME',
  deepseek:   'DEEPSEEK_PARAMETER_NAME',
  mistral:    'MISTRAL_PARAMETER_NAME',
  sambanova:  'SAMBANOVA_PARAMETER_NAME',
  gemini:     'GEMINI_PARAMETER_NAME',
};

/**
 * Safely parse JSON without throwing -- returns null on failure.
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

const SUI_OBJECT_ID_REGEX = /^0x[0-9a-fA-F]{1,64}$/;
const U64_DECIMAL_REGEX = /^[0-9]+$/;
const INTENT_ID_HEX_REGEX = /^[0-9a-fA-F]{32}$/; // 16 bytes = 32 hex chars

/**
 * Validate the v2 capability/envelope fields present on /execute and /record.
 * Returns null on success or a 400-error message describing the bad field.
 */
function validateCapabilityFields(body: AerCapabilityFields): string | null {
  if (typeof body.capabilityId !== 'string' || !SUI_OBJECT_ID_REGEX.test(body.capabilityId)) {
    return 'capabilityId must be a valid Sui object id';
  }
  if (typeof body.expectedCapabilityVersion !== 'string' || !U64_DECIMAL_REGEX.test(body.expectedCapabilityVersion)) {
    return 'expectedCapabilityVersion must be a decimal u64 string';
  }
  if (body.actionType !== undefined && (typeof body.actionType !== 'string' || body.actionType.length < 1 || body.actionType.length > 64)) {
    return 'actionType must be 1..64 chars';
  }
  if (body.eventClass !== undefined && (!Number.isInteger(body.eventClass) || body.eventClass < 1 || body.eventClass > 5)) {
    return 'eventClass must be an integer in [1,5]';
  }
  if (body.triggeredByType !== undefined && (!Number.isInteger(body.triggeredByType) || body.triggeredByType < 1 || body.triggeredByType > 5)) {
    return 'triggeredByType must be an integer in [1,5]';
  }
  if (body.triggeredByRef !== undefined && (typeof body.triggeredByRef !== 'string' || body.triggeredByRef.length > 256)) {
    return 'triggeredByRef must be a string under 256 chars';
  }
  if (body.parentIntentId !== undefined && (typeof body.parentIntentId !== 'string' || !INTENT_ID_HEX_REGEX.test(body.parentIntentId))) {
    return 'parentIntentId must be 32 hex chars (16 bytes)';
  }
  return null;
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

// CORS -- multi-origin support. Fail-secure: no header if unset.
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

  const sensitiveFields = ['encryptedPrompt', 'prompt', 'privateKey', 'apiKey', 'secret', 'result', 'signature', 'ephemeralPubKey', 'sig2', 'envelope'];

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

  // Load AI provider API keys from SSM Parameter Store (SecureString).
  // Each provider key is fetched in parallel. Missing env vars or missing
  // SSM parameters silently skip that provider; the fallback chain in
  // ai.ts handles a shorter provider list gracefully. At least one
  // provider key must resolve, enforced by initProviders().
  const fetched: Record<string, string | null> = {};
  await Promise.all(
    Object.entries(AI_PROVIDER_SSM_ENV).map(async ([providerName, envVar]) => {
      const paramName = process.env[envVar];
      if (!paramName) {
        fetched[providerName] = null;
        return;
      }
      try {
        const param = await ssmClient.send(
          new GetParameterCommand({ Name: paramName, WithDecryption: true })
        );
        const value = param.Parameter?.Value;
        if (value) {
          fetched[providerName] = value;
          console.log(`[Secrets] ${providerName} API key loaded from SSM`);
        } else {
          fetched[providerName] = null;
        }
      } catch (err) {
        // Classify the SSM error so silent degradation cannot hide a
        // misconfigured deploy. ParameterNotFound is the expected "operator
        // hasn't created this key yet" path and stays at info. AccessDenied
        // and ThrottlingException are loud because they mean the intended
        // provider IS configured but the Lambda can't reach it — left
        // unannounced this would silently route inference to a fallback
        // provider that the deploy never intended to use.
        const errName = (err as { name?: string }).name ?? '';
        const msg = err instanceof Error ? err.message : String(err);
        if (errName === 'ParameterNotFound') {
          console.log(`[Secrets] ${providerName} key not yet provisioned (${paramName}); skipping.`);
        } else if (errName === 'AccessDeniedException' || errName === 'ThrottlingException') {
          console.error(`[Secrets] ${providerName} key UNREACHABLE (${errName}, ${paramName}): ${msg} — provider will be skipped despite being configured.`);
        } else {
          console.warn(`[Secrets] ${providerName} key fetch failed (${errName || 'unknown'}, ${paramName}): ${msg}`);
        }
        fetched[providerName] = null;
      }
    })
  );
  providerApiKeys = fetched;

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

  // Initialize all configured AI providers. The chain in ai.ts will use
  // whatever subset returned a key from SSM; if zero providers got a key,
  // initProviders throws (cold start fails fast).
  initProviders(providerApiKeys);

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

  // Clear raw secrets from memory -- SDKs hold their own copies internally
  providerApiKeys = {};
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
    // Partial verification: verify ephemeral key signature.
    // Cannot fully bind ephemeral key to zkLogin address without ZK proof
    // verification, so we trust the client-provided `address` after verifying
    // the ephemeral signature matches.
    if (!req.ephemeralPubKey) {
      throw new Error('MISSING_EPHEMERAL_KEY');
    }
    // signWithEphemeralKey() returns the Sui-serialized signature
    // (1 flag byte + 64 sig bytes + 32 pubkey bytes, base64). Parse it so we
    // can (a) confirm the embedded pubkey equals the one the client sent and
    // (b) use the SDK's intent-aware personal-message verifier.
    const parsed = parseSerializedSignature(req.signature);
    if (parsed.signatureScheme !== 'ED25519') {
      throw new Error('UNSUPPORTED_SIGNATURE_SCHEME');
    }
    const clientPubKey = Buffer.from(req.ephemeralPubKey, 'base64');
    if (!Buffer.from(parsed.publicKey).equals(clientPubKey)) {
      throw new Error('EPHEMERAL_PUBKEY_MISMATCH');
    }
    const pubKey = new Ed25519PublicKey(clientPubKey);
    // verifyPersonalMessage handles the IntentMessage(PersonalMessage(bcs(msg)))
    // wrapping that signPersonalMessage applied on the client.
    const isValid = await pubKey.verifyPersonalMessage(message, req.signature);
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
/** Cloud model release date table -- used to build AER.replay.model_version. */
const MODEL_RELEASE: Record<string, string> = {
  'llama-3.3-70b-versatile': '2025-01-08',
};

function modelVersionTag(model: string): string {
  const release = MODEL_RELEASE[model];
  // Canonical commitment only: identical (prompt, model) MUST produce
  // identical `modelVersion` regardless of which fallback provider
  // served the inference. Baking the provider into this field would
  // make AER replay non-deterministic across cold starts. The provider
  // identity is surfaced separately via InferResponse.provider for
  // off-chain audit trails.
  return release ? `${model}@${release}` : model;
}

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
    capabilityId: body.capabilityId,
    expectedCapabilityVersion: body.expectedCapabilityVersion,
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
    teeVerified: false, // Lambda executor -- no TEE
    teeAttestationHash: null,
    triggeredBy: null,
    triggeredAction: null,
    parentIntentId: body.parentIntentId ?? null,
    eventClass: body.eventClass ?? 1, // COGNITION
    actionType: body.actionType ?? 'cognition.chat.v1',
    actionSchemaVersion: 1,
    actionSummary: result,
    actionOutcome: 1, // SUCCESS
    triggeredByType: body.triggeredByType ?? 4, // MANUAL (session-initiated chat)
    triggeredByRef: body.triggeredByRef ?? null,
    modelVersion: modelVersionTag(model),
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
 * Lambda performs settlement only -- no AI inference.
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
    capabilityId: body.capabilityId,
    expectedCapabilityVersion: body.expectedCapabilityVersion,
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
    parentIntentId: body.parentIntentId ?? null,
    eventClass: body.eventClass ?? 2, // EXECUTION (self-reported trader settlement)
    actionType: body.actionType ?? 'trade.swap.v1',
    actionSchemaVersion: 1,
    actionSummary: result,
    actionOutcome: 1,
    triggeredByType: body.triggeredByType ?? 1, // HEARTBEAT
    triggeredByRef: body.triggeredByRef ?? null,
    modelVersion: modelVersionTag(verification.request!.model || 'unknown'),
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

// ============================================================================
// /infer + /execute-capability (PR1.A HOLD-only)
// ============================================================================

const HEX32_LOWER = /^0x[0-9a-f]{64}$/;
const HEX_OBJECT_ID = /^0x[0-9a-fA-F]{1,64}$/;
const U64_DECIMAL = /^[0-9]+$/;
const ADDR_HEX = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ACTION_CALL_HASH = '0x' + '00'.repeat(32);

interface FieldError { field: string; reason: string; }

/**
 * Validate /infer body fields. Returns a string reason on failure, null on
 * success. Field-level errors map to 400. Address case-insensitive: lower
 * before semantic checks.
 */
function validateInferBody(body: InferRequest): FieldError | null {
  if (!isSafeRequestId(body.requestId)) return { field: 'requestId', reason: 'invalid_request_id' };
  if (typeof body.encryptedPrompt !== 'string' || body.encryptedPrompt.length === 0) {
    return { field: 'encryptedPrompt', reason: 'missing_encrypted_prompt' };
  }
  if (body.encryptedPrompt.length > 1 * 1024 * 1024) {
    return { field: 'encryptedPrompt', reason: 'encrypted_prompt_too_large' };
  }
  if (typeof body.model !== 'string') return { field: 'model', reason: 'invalid_body' };
  if (typeof body.capabilityId !== 'string' || !HEX_OBJECT_ID.test(body.capabilityId)) {
    return { field: 'capabilityId', reason: 'invalid_capability_id' };
  }
  if (typeof body.principalAddress !== 'string' || !ADDR_HEX.test(body.principalAddress)) {
    return { field: 'principalAddress', reason: 'invalid_principal_address' };
  }
  if (typeof body.promptHash !== 'string' || !HEX32_LOWER.test(body.promptHash.toLowerCase())) {
    return { field: 'promptHash', reason: 'invalid_prompt_hash' };
  }
  if (typeof body.expectedCapabilityVersion !== 'string' || !U64_DECIMAL.test(body.expectedCapabilityVersion)) {
    return { field: 'expectedCapabilityVersion', reason: 'invalid_capability_version' };
  }
  return null;
}

/**
 * Validate /execute-capability body. Returns first failure.
 *
 * PR1.A: actionCall/escrow/spend MUST be null. If any are present, callers
 * get 400 with reason='swap_in_pr1_5' so PR1.5 enablement is visible.
 */
function validateExecuteCapabilityBody(body: ExecuteCapabilityRequest): FieldError | null {
  if (!isSafeRequestId(body.requestId)) return { field: 'requestId', reason: 'invalid_request_id' };
  if (typeof body.promptHash !== 'string' || !HEX32_LOWER.test(body.promptHash.toLowerCase())) {
    return { field: 'promptHash', reason: 'invalid_prompt_hash' };
  }
  if (typeof body.resultHash !== 'string' || !HEX32_LOWER.test(body.resultHash.toLowerCase())) {
    return { field: 'resultHash', reason: 'invalid_result_hash' };
  }
  if (typeof body.result !== 'string' || body.result.length === 0 || body.result.length > 64_000) {
    return { field: 'result', reason: 'invalid_result' };
  }
  if (typeof body.executionTimeMs !== 'number' || !Number.isFinite(body.executionTimeMs) || body.executionTimeMs < 0) {
    return { field: 'executionTimeMs', reason: 'invalid_execution_time' };
  }
  if (typeof body.model !== 'string') return { field: 'model', reason: 'invalid_body' };
  if (typeof body.capabilityId !== 'string' || !HEX_OBJECT_ID.test(body.capabilityId)) {
    return { field: 'capabilityId', reason: 'invalid_capability_id' };
  }
  if (typeof body.agentAddress !== 'string' || !ADDR_HEX.test(body.agentAddress)) {
    return { field: 'agentAddress', reason: 'invalid_agent_address' };
  }
  if (typeof body.principalAddress !== 'string' || !ADDR_HEX.test(body.principalAddress)) {
    return { field: 'principalAddress', reason: 'invalid_principal_address' };
  }
  if (typeof body.expectedCapabilityVersion !== 'string' || !U64_DECIMAL.test(body.expectedCapabilityVersion)) {
    return { field: 'expectedCapabilityVersion', reason: 'invalid_capability_version' };
  }
  if (typeof body.envelopeHash !== 'string' || !HEX32_LOWER.test(body.envelopeHash.toLowerCase())) {
    return { field: 'envelopeHash', reason: 'invalid_envelope_hash' };
  }
  if (typeof body.actionCallHash !== 'string' || !HEX32_LOWER.test(body.actionCallHash.toLowerCase())) {
    return { field: 'actionCallHash', reason: 'invalid_action_call_hash' };
  }
  if (typeof body.sig2 !== 'string' || body.sig2.length < 16 || body.sig2.length > 512) {
    return { field: 'sig2', reason: 'invalid_signature' };
  }
  // PR1.5: actionCall/escrow/spend must be ALL-null (HOLD) or ALL-non-null
  // (swap). Per-shape validation lives in validateSwapWireShape() -- this only
  // enforces the XOR invariant.
  const swapFieldsPresent = (body.actionCall !== null ? 1 : 0)
    + (body.escrow !== null ? 1 : 0)
    + (body.spend !== null ? 1 : 0);
  if (swapFieldsPresent !== 0 && swapFieldsPresent !== 3) {
    return { field: 'actionCall', reason: 'swap_blocks_partial' };
  }
  if (swapFieldsPresent === 3) {
    const shapeErr = validateSwapWireShape(body.actionCall!, body.escrow!, body.spend!);
    if (shapeErr) return shapeErr;
  }
  if (!body.envelope || typeof body.envelope !== 'object') {
    return { field: 'envelope', reason: 'invalid_envelope' };
  }
  if (!body.lineage || typeof body.lineage !== 'object') {
    return { field: 'lineage', reason: 'invalid_lineage' };
  }
  if (!body.wake || typeof body.wake !== 'object') return { field: 'wake', reason: 'invalid_wake' };
  if (!body.replay || typeof body.replay !== 'object') return { field: 'replay', reason: 'invalid_replay' };
  if (!body.proposal || typeof body.proposal !== 'object') return { field: 'proposal', reason: 'invalid_proposal' };
  return null;
}

// ============================================================================
// PR1.5 swap-path validation (spec §4 + §5)
// ============================================================================

const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Structural validation of the swap wire blocks. Field shapes only -- semantic
 * checks (allow-list, asset coverage, slippage cap, hash recompute, cap fetch)
 * live in validateSwapAtBoundary(). Keeping these split lets us reject obvious
 * malformed bodies with 400 before any RPC roundtrip.
 */
export function validateSwapWireShape(
  actionCall: ActionCallSpecWire,
  escrow: EscrowBlock,
  spend: SpendBlock,
): FieldError | null {
  if (!actionCall || typeof actionCall !== 'object') return { field: 'actionCall', reason: 'invalid_action_call' };
  if (typeof actionCall.targetPackage !== 'string' || !HEX_OBJECT_ID.test(actionCall.targetPackage)) {
    return { field: 'actionCall.targetPackage', reason: 'invalid_target_package' };
  }
  if (actionCall.module !== 'pool') return { field: 'actionCall.module', reason: 'invalid_module' };
  if (actionCall.fn !== 'swap_exact_quote_for_base' && actionCall.fn !== 'swap_exact_base_for_quote') {
    return { field: 'actionCall.fn', reason: 'invalid_swap_fn' };
  }
  if (!Array.isArray(actionCall.typeArguments) || actionCall.typeArguments.length !== 2) {
    return { field: 'actionCall.typeArguments', reason: 'invalid_type_arguments' };
  }
  for (const t of actionCall.typeArguments) {
    if (typeof t !== 'string' || t.length === 0 || t.length > 512) {
      return { field: 'actionCall.typeArguments', reason: 'invalid_type_arguments' };
    }
  }
  if (!Array.isArray(actionCall.args) || actionCall.args.length !== 5) {
    // DeepBook v3 swap signature: [pool, coin_in, deep_in, min_out, clock]
    return { field: 'actionCall.args', reason: 'invalid_args_length' };
  }
  const [a0, a1, a2, a3, a4] = actionCall.args;
  if (a0?.kind !== 'object' || typeof a0.id !== 'string' || !HEX_OBJECT_ID.test(a0.id)) {
    return { field: 'actionCall.args[0]', reason: 'invalid_pool_arg' };
  }
  if (a1?.kind !== 'pipe' || a1.from !== 'withdraw_coin') {
    return { field: 'actionCall.args[1]', reason: 'invalid_coin_in_pipe' };
  }
  if (a2?.kind !== 'pipe' || a2.from !== 'zero_deep') {
    return { field: 'actionCall.args[2]', reason: 'invalid_deep_in_pipe' };
  }
  // Step 11: clientMinOut sanity -- must decode as 8-byte BCS u64.
  if (a3?.kind !== 'pure' || typeof a3.bytes !== 'string' || !BASE64_REGEX.test(a3.bytes)) {
    return { field: 'actionCall.args[3]', reason: 'invalid_min_out_bytes' };
  }
  try {
    const decoded = Buffer.from(a3.bytes, 'base64');
    if (decoded.length !== 8) return { field: 'actionCall.args[3]', reason: 'min_out_not_u64' };
  } catch {
    return { field: 'actionCall.args[3]', reason: 'min_out_not_u64' };
  }
  if (a4?.kind !== 'object' || a4.id !== '0x6') {
    return { field: 'actionCall.args[4]', reason: 'invalid_clock_arg' };
  }

  if (typeof escrow.objectId !== 'string' || !HEX_OBJECT_ID.test(escrow.objectId)) {
    return { field: 'escrow.objectId', reason: 'invalid_escrow_id' };
  }
  if (typeof escrow.initialSharedVersion !== 'string' || !U64_DECIMAL.test(escrow.initialSharedVersion)) {
    return { field: 'escrow.initialSharedVersion', reason: 'invalid_escrow_initial_shared_version' };
  }
  if (typeof escrow.capabilityId !== 'string' || !HEX_OBJECT_ID.test(escrow.capabilityId)) {
    return { field: 'escrow.capabilityId', reason: 'invalid_escrow_capability_id' };
  }
  if (typeof escrow.capabilityInitialSharedVersion !== 'string' || !U64_DECIMAL.test(escrow.capabilityInitialSharedVersion)) {
    return { field: 'escrow.capabilityInitialSharedVersion', reason: 'invalid_cap_initial_shared_version' };
  }
  if (typeof spend.coinAssetType !== 'string' || spend.coinAssetType.length === 0 || spend.coinAssetType.length > 512) {
    return { field: 'spend.coinAssetType', reason: 'invalid_spend_asset_type' };
  }
  if (typeof spend.amount !== 'string' || !U64_DECIMAL.test(spend.amount) || spend.amount === '0') {
    return { field: 'spend.amount', reason: 'invalid_spend_amount' };
  }
  return null;
}

/**
 * Spec §4 boundary validation: 12 ordered checks. Returns `null` on success
 * or `{ statusCode, reason }` on first failure. Order matters -- fail-fast on
 * cheap checks before the cap RPC roundtrip.
 *
 * Steps 1, 2 (XOR), 3 (actionCallHash), 4 (sig2) run upstream in the handler.
 * This function covers steps 5–12: address normalize, allow-lists, cap
 * fetch/assertions, asset coverage, slippage cap, cap initialSharedVersion.
 *
 * Step 11 (clientMinOut decode) is in validateSwapWireShape() since it is
 * purely structural.
 */
interface BoundaryFailure { statusCode: number; reason: string; }

// Spec §5 env-driven allow-lists. Read fresh per request -- Lambda env updates
// are atomic (deploy or env-update) so the value at first read is canonical.
function readSwapEnv(): {
  disabled: boolean;
  packageAllowlist: Set<string>;
  poolAllowlist: Set<string>;
  deepType: string;
  maxSlippageBpsCap: number;
} {
  const disabled = (process.env.LAMBDA_SWAP_DISABLED ?? 'true') !== 'false';
  const packageAllowlist = new Set(
    (process.env.DEEPBOOK_PACKAGE_ALLOWLIST ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => normalizeSuiAddress(s).toLowerCase()),
  );
  const poolAllowlist = new Set(
    (process.env.DEEPBOOK_POOL_ALLOWLIST ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => normalizeSuiAddress(s).toLowerCase()),
  );
  const deepType = (process.env.DEEP_TYPE ?? '').trim();
  const maxSlippageBpsCap = Number(process.env.MAX_SLIPPAGE_BPS_CAP ?? '500');
  return { disabled, packageAllowlist, poolAllowlist, deepType, maxSlippageBpsCap };
}

function canonicalTypeString(raw: string): string {
  // Normalize the address prefix of an `0x<addr>::module::Type` string by
  // running normalizeSuiAddress on the address portion. Fall back to a
  // lowercased input if it's malformed (the allow-list compare will reject).
  const colonIdx = raw.indexOf('::');
  if (colonIdx < 0) return raw.toLowerCase();
  const addr = raw.slice(0, colonIdx);
  const rest = raw.slice(colonIdx);
  try {
    return `${normalizeSuiAddress(addr).toLowerCase()}${rest}`;
  } catch {
    return raw.toLowerCase();
  }
}

async function validateSwapAtBoundary(
  actionCall: ActionCallSpecWire,
  escrow: EscrowBlock,
  spend: SpendBlock,
  principalAddress: string,
  expectedCapabilityVersion: string,
  env: ReturnType<typeof readSwapEnv>,
): Promise<{ ok: true; cap: Awaited<ReturnType<typeof getCapabilityFieldsFull>> } | { ok: false; failure: BoundaryFailure }> {
  // Step 5: address normalize.
  const packageNorm = normalizeSuiAddress(actionCall.targetPackage).toLowerCase();
  const poolNorm = normalizeSuiAddress(actionCall.args[0].id!).toLowerCase();

  // Step 6: package allow-list.
  if (env.packageAllowlist.size === 0 || !env.packageAllowlist.has(packageNorm)) {
    return { ok: false, failure: { statusCode: 403, reason: 'package_not_allowed' } };
  }

  // Step 7: pool allow-list. Only boundary that blocks attacker-pool routing.
  if (env.poolAllowlist.size === 0 || !env.poolAllowlist.has(poolNorm)) {
    return { ok: false, failure: { statusCode: 403, reason: 'pool_not_allowed' } };
  }

  // Step 8: capability fetch + assertions (owner / version / pause / revoked).
  let cap: Awaited<ReturnType<typeof getCapabilityFieldsFull>>;
  try {
    cap = await getCapabilityFieldsFull(escrow.capabilityId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Swap] capability fetch failed:', msg);
    return { ok: false, failure: { statusCode: 503, reason: 'capability_fetch_failed' } };
  }
  if (cap.revoked) return { ok: false, failure: { statusCode: 403, reason: 'capability_revoked' } };
  if (cap.pauseMode !== 0) return { ok: false, failure: { statusCode: 403, reason: 'capability_paused' } };
  if (cap.owner.toLowerCase() !== principalAddress.toLowerCase()) {
    return { ok: false, failure: { statusCode: 403, reason: 'capability_owner_mismatch' } };
  }
  if (cap.version !== expectedCapabilityVersion) {
    return { ok: false, failure: { statusCode: 403, reason: 'capability_version_mismatch' } };
  }

  // Step 9: cap.allowed_assets covers spend + both swap typeArguments.
  // Both sides MUST go through canonicalTypeString so the address portion is
  // padded identically and the module/type case is preserved -- a prior
  // `.toLowerCase()` on the cap side lowercased "NUSDC" → "nusdc" while the
  // wire side preserved case, silently failing every comparison.
  const spendType = canonicalTypeString(spend.coinAssetType);
  const baseType = canonicalTypeString(actionCall.typeArguments[0]);
  const quoteType = canonicalTypeString(actionCall.typeArguments[1]);
  const allowed = new Set(cap.allowedAssets.map(canonicalTypeString));
  if (!allowed.has(spendType)) {
    return { ok: false, failure: { statusCode: 403, reason: 'spend_asset_not_allowed' } };
  }
  if (!allowed.has(baseType) || !allowed.has(quoteType)) {
    return { ok: false, failure: { statusCode: 403, reason: 'swap_asset_not_allowed' } };
  }
  // Step 9b: spend.coinAssetType must match T_in for the swap direction.
  // BUY  (swap_exact_quote_for_base): T_in=Quote
  // SELL (swap_exact_base_for_quote): T_in=Base
  // Without this check, a malicious runtime could withdraw the wrong asset
  // (Move boundary would still abort, but this surfaces the issue earlier
  // with a clearer reason and avoids burning an on-chain attempt).
  const expectedSpendType = actionCall.fn === 'swap_exact_quote_for_base' ? quoteType : baseType;
  if (spendType !== expectedSpendType) {
    return { ok: false, failure: { statusCode: 403, reason: 'spend_asset_direction_mismatch' } };
  }

  // Step 10: slippage cap. cap.risk_limits.max_slippage_bps must stay under
  // the Lambda-side ceiling so a cap with a runaway slippage tolerance can't
  // be used to bypass the prototype's MEV defenses.
  if (!Number.isFinite(env.maxSlippageBpsCap) || env.maxSlippageBpsCap <= 0) {
    console.error('[Swap] MAX_SLIPPAGE_BPS_CAP env missing or non-positive');
    return { ok: false, failure: { statusCode: 500, reason: 'misconfigured_slippage_cap' } };
  }
  if (cap.maxSlippageBps > env.maxSlippageBpsCap) {
    return { ok: false, failure: { statusCode: 403, reason: 'slippage_cap_exceeded' } };
  }

  // Step 12: cap initialSharedVersion self-check. The wire value is
  // sig2-uncovered (see spec §3.3), so we reconcile against the on-chain
  // owner descriptor here. Immutable post-creation, so any mismatch is a
  // tamper or a stale runtime cache -- fail closed.
  if (cap.initialSharedVersion !== escrow.capabilityInitialSharedVersion) {
    return { ok: false, failure: { statusCode: 403, reason: 'capability_initial_shared_version_mismatch' } };
  }

  return { ok: true, cap };
}

/**
 * /infer -- runs inference bound to a pre-created on-chain request.
 *
 * Trust layers (no caller signature here -- sig is at /execute-capability):
 *   L1 API key (apiKeyRequired)
 *   L3 chain: verifyRequest checks (requester != executor, status, timeout, promptHash)
 *   L4 cap:  cap.owner == principalAddress && cap.version == expectedVersion
 *           + !revoked + pause_mode == active
 *
 * 20s Groq budget -- caller (runtime) must accommodate; SDK retries disabled
 * to keep the abort budget honest (services/ai.ts initGroq).
 */
async function handleInfer(body: InferRequest): Promise<{ statusCode: number; body: InferResponse }> {
  const startTime = Date.now();
  const { requestId, model, capabilityId, principalAddress, expectedCapabilityVersion } = body;
  const promptHash = body.promptHash.toLowerCase();
  const promptHashRaw = promptHash.startsWith('0x') ? promptHash.slice(2) : promptHash;

  console.log(`[Infer] requestId=${requestId} cap=${capabilityId} v=${expectedCapabilityVersion}`);

  // L4a: cap fetch first -- cheaper than chain request lookup.
  let cap;
  try {
    cap = await getCapabilityFields(capabilityId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Infer] capability fetch failed', msg);
    return { statusCode: 503, body: { success: false, error: 'capability_fetch_failed', reason: 'capability_fetch_failed' } };
  }
  if (cap.revoked) {
    return { statusCode: 403, body: { success: false, error: 'capability revoked', reason: 'capability_revoked' } };
  }
  if (cap.pauseMode !== 0) {
    return { statusCode: 403, body: { success: false, error: 'capability paused', reason: 'capability_paused' } };
  }
  if (cap.owner.toLowerCase() !== principalAddress.toLowerCase()) {
    return { statusCode: 403, body: { success: false, error: 'capability owner mismatch', reason: 'capability_owner_mismatch' } };
  }
  if (cap.version !== expectedCapabilityVersion) {
    return { statusCode: 403, body: { success: false, error: 'capability version mismatch', reason: 'capability_version_mismatch' } };
  }

  // L3: on-chain request verification (Lambda executor == request.executor,
  // promptHash match, status, timeout).
  const verification = await verifyRequest(requestId, promptHashRaw);
  if (!verification.valid) {
    const v = verification.error ?? '';
    const reason =
      v.includes('not found') ? 'request_not_found'
        : v.includes('Prompt hash mismatch') ? 'prompt_hash_mismatch'
        : v.includes('Executor mismatch') ? 'executor_mismatch'
        : v.includes('timeout') ? 'request_timeout'
        : 'request_invalid';
    return { statusCode: reason === 'request_not_found' ? 404 : 403, body: { success: false, error: v, reason } };
  }

  // Model gate AFTER chain checks so an invalid model can't be probed for
  // chain state.
  if (!isValidModel(model)) {
    return { statusCode: 400, body: { success: false, error: `Unsupported model: ${model}`, reason: 'invalid_body' } };
  }

  // Decrypt + integrity check the supplied promptHash against the decoded
  // bytes (catches a buggy host sending mismatched hash + prompt).
  const prompt = decryptPrompt(body.encryptedPrompt);
  const localPromptHash = sha256(prompt);
  if (localPromptHash !== promptHashRaw) {
    return { statusCode: 403, body: { success: false, error: 'prompt hash mismatch (decoded)', reason: 'prompt_hash_mismatch' } };
  }

  // Inference with 20s budget. SDK retries disabled (services/ai.ts).
  let completion;
  try {
    completion = await generateCompletion(prompt, model, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    const e = err as Error;
    const msg = (e?.message ?? '').toLowerCase();
    if (msg.includes('abort') || (e as { name?: string })?.name === 'AbortError') {
      return { statusCode: 503, body: { success: false, error: 'inference timeout', reason: 'inference_timeout' } };
    }
    const classified = classifyError(e);
    return { statusCode: classified.status, body: { success: false, error: classified.message, reason: 'inference_error' } };
  }

  const result = completion.content;
  const resultHash = sha256Hex0x(result);
  const executionTimeMs = Date.now() - startTime;
  console.log(`[Infer] requestId=${requestId} ok tokens=${completion.totalTokens} elapsed=${executionTimeMs}ms`);

  return {
    statusCode: 200,
    body: {
      success: true,
      result,
      resultHash,
      capabilityVersion: cap.version,
      executionTimeMs,
      // Additive: actual provider that served the inference. Older runtime
      // versions ignore this field; PR2.B+ runtimes propagate it into
      // replay.modelVersion so the AER records `<model>+<provider>`.
      provider: completion.provider,
      modelUsed: completion.model,
    },
  };
}

/**
 * /execute-capability -- agent-signed settlement.
 *
 * PR1.A HOLD-only. actionCall/escrow/spend must be null (validated above).
 * Settlement PTB is the existing cognition path (submit_proof_with_receipt
 * + create_report_with_receipt_capability) -- same call used by /execute.
 */
async function handleExecuteCapability(
  body: ExecuteCapabilityRequest,
): Promise<{ statusCode: number; body: ExecuteCapabilityResponse }> {
  const startTime = Date.now();
  const { requestId, model, capabilityId, agentAddress, principalAddress, expectedCapabilityVersion } = body;
  const promptHash = body.promptHash.toLowerCase();
  const promptHashRaw = promptHash.startsWith('0x') ? promptHash.slice(2) : promptHash;
  const resultHash = body.resultHash.toLowerCase();
  const resultHashRaw = resultHash.startsWith('0x') ? resultHash.slice(2) : resultHash;

  console.log(`[Exec] requestId=${requestId} cap=${capabilityId} v=${expectedCapabilityVersion}`);

  // Anti-tamper: result text must hash to the claimed resultHash.
  const localResultHash = sha256Hex0x(body.result);
  if (localResultHash.toLowerCase() !== resultHash) {
    return { statusCode: 400, body: { success: false, error: 'result hash mismatch', reason: 'result_hash_mismatch' } };
  }

  // Envelope anti-tamper: recompute against canonical JSON.
  const computedEnvelopeHash = canonicalJsonSha256(body.envelope);
  if (computedEnvelopeHash.toLowerCase() !== body.envelopeHash.toLowerCase()) {
    return { statusCode: 403, body: { success: false, error: 'envelope tampered', reason: 'envelope_tampered' } };
  }

  // PR1.5 branch detection. validateExecuteCapabilityBody() has already
  // enforced the ALL-null XOR ALL-non-null invariant + swap wire shape.
  const isSwap = body.actionCall !== null;

  // Spec §4 step 1: L2 kill switch. Read env once per request so an in-flight
  // env update flips the next call without restart. HOLD branch is unaffected.
  const swapEnv = readSwapEnv();
  if (isSwap && swapEnv.disabled) {
    return { statusCode: 403, body: { success: false, error: 'swap path disabled', reason: 'swap_disabled' } };
  }
  if (isSwap && !swapEnv.deepType) {
    console.error('[Swap] DEEP_TYPE env missing -- cannot build PTB');
    return { statusCode: 500, body: { success: false, error: 'misconfigured', reason: 'deep_type_missing' } };
  }

  // actionCallHash binding (spec §3.1). HOLD: zero-bytes. Swap: recomputed
  // canonical-JSON hash of {actionCall, escrow, spend}.
  if (isSwap) {
    const hashInput: ActionCallHashInput = {
      actionCall: body.actionCall!,
      escrow: body.escrow!,
      spend: body.spend!,
    };
    const recomputed = computeActionCallHash(hashInput);
    if (recomputed.toLowerCase() !== body.actionCallHash.toLowerCase()) {
      return { statusCode: 403, body: { success: false, error: 'actionCallHash mismatch', reason: 'action_call_hash_mismatch' } };
    }
  } else {
    if (body.actionCallHash.toLowerCase() !== ZERO_ACTION_CALL_HASH) {
      return { statusCode: 400, body: { success: false, error: 'actionCallHash must be zero in HOLD', reason: 'invalid_action_call_hash' } };
    }
  }

  // L2: agent signature over the full settlement intent.
  const sigFields: SettleSigFields = {
    v: 1,
    kind: 'nasun-ai-settle',
    requestId: String(requestId),
    promptHash,
    resultHash,
    agentAddress: agentAddress.toLowerCase(),
    principalAddress: principalAddress.toLowerCase(),
    capabilityId: capabilityId.toLowerCase(),
    expectedCapabilityVersion,
    envelopeHash: body.envelopeHash.toLowerCase(),
    actionCallHash: body.actionCallHash.toLowerCase(),
  };
  const sigRes = await verifySettleSig(sigFields, body.sig2, agentAddress);
  if (!sigRes.ok) {
    return { statusCode: 403, body: { success: false, error: 'signature verification failed', reason: sigRes.reason } };
  }

  // L4: cap fetch + assertions. Swap path runs the full spec §4 5–12
  // boundary validation (allow-lists, asset coverage, slippage cap,
  // initialSharedVersion self-check); HOLD keeps the lightweight 4-field
  // fetch since it can't touch escrow.
  let capVersion: string;
  if (isSwap) {
    const boundary = await validateSwapAtBoundary(
      body.actionCall!,
      body.escrow!,
      body.spend!,
      principalAddress,
      expectedCapabilityVersion,
      swapEnv,
    );
    if (!boundary.ok) {
      return {
        statusCode: boundary.failure.statusCode,
        body: { success: false, error: boundary.failure.reason, reason: boundary.failure.reason },
      };
    }
    capVersion = boundary.cap.version;
  } else {
    let cap;
    try {
      cap = await getCapabilityFields(capabilityId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Exec] capability fetch failed', msg);
      return { statusCode: 503, body: { success: false, error: 'capability_fetch_failed', reason: 'capability_fetch_failed' } };
    }
    if (cap.revoked) {
      return { statusCode: 403, body: { success: false, error: 'capability revoked', reason: 'capability_revoked' } };
    }
    if (cap.pauseMode !== 0) {
      return { statusCode: 403, body: { success: false, error: 'capability paused', reason: 'capability_paused' } };
    }
    if (cap.owner.toLowerCase() !== principalAddress.toLowerCase()) {
      return { statusCode: 403, body: { success: false, error: 'capability owner mismatch', reason: 'capability_owner_mismatch' } };
    }
    if (cap.version !== expectedCapabilityVersion) {
      return { statusCode: 403, body: { success: false, error: 'capability version mismatch', reason: 'capability_version_mismatch' } };
    }
    capVersion = cap.version;
  }

  // L3: on-chain request still valid.
  const verification = await verifyRequest(requestId, promptHashRaw);
  if (!verification.valid) {
    const v = verification.error ?? '';
    const reason =
      v.includes('not found') ? 'request_not_found'
        : v.includes('Prompt hash mismatch') ? 'prompt_hash_mismatch'
        : v.includes('Executor mismatch') ? 'executor_mismatch'
        : v.includes('status is not') || v.includes('already') ? 'already_settled'
        : v.includes('timeout') ? 'request_timeout'
        : 'request_invalid';
    return { statusCode: 403, body: { success: false, error: v, reason } };
  }

  // Settlement PTB. Reuses the existing 2-call cognition path
  // (submit_proof_with_receipt + create_report_with_receipt_capability).
  // The envelope shape from the runtime tells the AER what cognition/
  // execution class to record; PR1.A forces HOLD via the runtime so this
  // path stays purely cognition.
  const executorAddress = getExecutorAddress();
  const executorStats = await getExecutorStats(executorAddress);

  const envelope = body.envelope as {
    actionType?: string;
    actionSummary?: string;
    actionOutcome?: number;
    eventClass?: number;
  };
  const wake = body.wake as { triggeredByType?: number; triggeredByRef?: string | null };
  const lineage = body.lineage as { parentIntentId?: number[] | null };
  const replay = body.replay as { modelVersion?: string };

  const aerData: AERReportData = {
    capabilityId: body.capabilityId,
    expectedCapabilityVersion: body.expectedCapabilityVersion,
    initiator: verification.request!.requester,
    delegationPath: [],
    executorPrincipal: null,
    feeDetail: null,
    budgetId: body.budgetId ?? null,
    budgetRemaining: null,
    modelMetadata: null,
    purpose: body.purpose ?? 'trader_cycle',
    constraints: body.constraints ?? null,
    executorTier: executorStats.tier,
    executorReputation: executorStats.reputation,
    executorStakeAmount: executorStats.stakeAmount,
    teeVerified: false,
    teeAttestationHash: null,
    triggeredBy: body.triggeredBy ?? null,
    triggeredAction: body.triggeredAction ?? null,
    parentIntentId: lineage?.parentIntentId
      ? Buffer.from(Uint8Array.from(lineage.parentIntentId)).toString('hex')
      : null,
    eventClass: envelope?.eventClass ?? 1,
    actionType: envelope?.actionType ?? 'analysis.v1',
    actionSchemaVersion: 1,
    actionSummary: envelope?.actionSummary ?? body.result.slice(0, 240),
    actionOutcome: envelope?.actionOutcome ?? 2,            // HOLD-noop default
    triggeredByType: wake?.triggeredByType ?? 1,            // HEARTBEAT default
    triggeredByRef: wake?.triggeredByRef ?? null,
    modelVersion: replay?.modelVersion ?? modelVersionTag(model),
  };

  try {
    const txDigest = isSwap
      ? await submitSwapPTBWithAER(
          requestId,
          resultHashRaw,
          body.executionTimeMs,
          verification.request!,
          aerData,
          {
            actionCall: body.actionCall!,
            escrow: body.escrow!,
            spend: body.spend!,
            expectedCapabilityVersion,
          },
          swapEnv.deepType,
        )
      : await submitProofWithAER(
          requestId,
          resultHashRaw,
          body.executionTimeMs,
          verification.request!,
          aerData,
        );
    const executionTimeMs = Date.now() - startTime;
    console.log(`[Exec] requestId=${requestId} settled tx=${txDigest} cap.v=${capVersion} swap=${isSwap}`);
    return {
      statusCode: 200,
      body: {
        success: true,
        requestId,
        resultHash,
        txDigest,
        capabilityVersion: capVersion,
        executionTimeMs,
      },
    };
  } catch (err) {
    const e = err as Error;
    console.error('[Exec] proof submission failed:', e.message);
    const classified = classifyError(e);
    const reason = classified.status === 409 ? 'already_settled' : 'settlement_failed';
    return { statusCode: classified.status, body: { success: false, error: classified.message, reason } };
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

      const capFieldError = validateCapabilityFields(body);
      if (capFieldError) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: capFieldError }),
        };
      }

      const response = await handleExecute(body);

      return {
        statusCode: response.success ? 200 : 400,
        headers: corsHeaders,
        body: JSON.stringify(response),
      };
    }

    // POST /infer (PR1.A: split-inference for trader heartbeat)
    if (path.endsWith('/infer') && event.httpMethod === 'POST') {
      if (!event.body) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Request body is required', reason: 'missing_body' }) };
      }
      const parsed = safeJsonParse(event.body);
      if (!parsed || typeof parsed !== 'object') {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body', reason: 'invalid_json' }) };
      }
      const body = parsed as InferRequest;
      const fieldErr = validateInferBody(body);
      if (fieldErr) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: fieldErr.field, reason: fieldErr.reason }) };
      }
      const result = await handleInfer(body);
      return { statusCode: result.statusCode, headers: corsHeaders, body: JSON.stringify(result.body) };
    }

    // POST /execute-capability (PR1.A: agent-signed settlement, HOLD-only)
    if (path.endsWith('/execute-capability') && event.httpMethod === 'POST') {
      if (!event.body) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Request body is required', reason: 'missing_body' }) };
      }
      const parsed = safeJsonParse(event.body);
      if (!parsed || typeof parsed !== 'object') {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body', reason: 'invalid_json' }) };
      }
      const body = parsed as ExecuteCapabilityRequest;
      const fieldErr = validateExecuteCapabilityBody(body);
      if (fieldErr) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: fieldErr.field, reason: fieldErr.reason }) };
      }
      const result = await handleExecuteCapability(body);
      return { statusCode: result.statusCode, headers: corsHeaders, body: JSON.stringify(result.body) };
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

      const capFieldError = validateCapabilityFields(body);
      if (capFieldError) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: capFieldError }),
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

    // GET /result?requestId=N&authorizer=0x... (DEPRECATED -- use POST /result)
    if (path.endsWith('/result') && event.httpMethod === 'GET') {
      console.warn('[DEPRECATED] GET /result used -- migrate to POST /result with wallet signature');

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

    // POST /result -- authenticated result retrieval with wallet signature
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
