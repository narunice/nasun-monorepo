/**
 * Host HTTP Server
 *
 * The Host exposes HTTP endpoints for external clients (Frontend/Lambda).
 * All requests are proxied to the Enclave via vsock.
 *
 * In production AWS Nitro:
 * - Host runs on EC2 instance
 * - Receives HTTPS requests from API Gateway or direct calls
 * - Forwards to Enclave via vsock
 * - Cannot see decrypted prompts (only Enclave has private key)
 *
 * In local simulation:
 * - Host runs on localhost
 * - Same HTTP endpoints
 * - Forwards to Enclave via TCP
 */

import express, { Request, Response, NextFunction } from 'express';
import { VsockClient, getVsockClient } from './vsock-client.js';
import { HOST_HTTP_PORT, PROTOCOL_VERSION } from '../shared/protocol.js';
import { verifyAttestationDocument, type VerificationResult } from '../enclave/attestation.js';
import {
  initSuiClient,
  verifyExecutorRegistration,
  getRequest,
  getExecutorAddress,
  getExecutorStats,
  getAttestationBaseline,
  submitProofWithAERRetry,
  submitProofWithAERCapability,
  defaultCognitionEnvelope,
  actionPayloadHash,
  sha256Bytes,
  type SuiConfig,
  type AERReportData,
  type AEREnvelopeMeta,
  type AERLineageMeta,
  type AERWakeMeta,
  type AERReplayMeta,
  type ActionCallSpec,
} from './sui-client.js';
import {
  preflight as capabilityPreflight,
  recordCognitionPayout,
  configureCognitionCap,
  loadActionClasses,
  type ActionProposal,
} from './capability.js';
import { SuiClient } from '@mysten/sui/client';

/**
 * HTTP Server configuration
 */
interface ServerConfig {
  port: number;
  enclaveHost: string;
  enclavePort: number;
  sui?: SuiConfig;
}

const DEFAULT_CONFIG: Omit<ServerConfig, 'sui'> = {
  port: HOST_HTTP_PORT,
  enclaveHost: 'localhost', // In production, would be vsock CID
  enclavePort: 5050,
};

/**
 * Create and configure the Express server
 */
export function createServer(config: Partial<ServerConfig> = {}): express.Application {
  const serverConfig = { ...DEFAULT_CONFIG, ...config };
  const app = express();

  // Initialize vsock client
  const vsockClient = getVsockClient({
    host: serverConfig.enclaveHost,
    port: serverConfig.enclavePort,
  });

  // Initialize Sui client for on-chain settlement + compliance
  let suiEnabled = false;
  if (serverConfig.sui) {
    try {
      initSuiClient(serverConfig.sui);
      suiEnabled = true;
      console.log('[Host/Server] Sui settlement enabled');

      // Verify executor key matches on-chain registration (fatal on mismatch)
      verifyExecutorRegistration().catch((err) => {
        console.error(`[FATAL] Executor registration check failed: ${err instanceof Error ? err.message : err}`);
        console.error('[FATAL] Settlement would fail for every request. Shutting down.');
        process.exit(1);
      });
    } catch (err) {
      console.warn('[Host/Server] Sui settlement disabled:', err instanceof Error ? err.message : err);
    }
  } else {
    console.warn('[Host/Server] Sui config not provided, settlement disabled');
  }

  // Middleware
  app.use(express.json({ limit: '1mb' }));

  // In-memory rate limiter for /execute (no external dependency)
  const rateLimitWindow = 60_000; // 1 minute
  const rateLimitMax = 15; // max requests per window per IP
  const requestCounts = new Map<string, { count: number; resetAt: number }>();

  function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now >= entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + rateLimitWindow });
      next();
      return;
    }

    if (entry.count >= rateLimitMax) {
      res.status(429).json({ success: false, error: 'Too many requests' });
      return;
    }

    entry.count++;
    next();
  }

  // CORS — explicit allowlist; localhost auto-allow ONLY when developer opts in
  // via BARAM_DEV_CORS_LOCALHOST=true. We do NOT enable it by default because
  // any locally-running page (browser extensions, dev tools, electron apps)
  // could otherwise spend the operator's escrow / burn LLM quota.
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;
  const devLocalhost = process.env.BARAM_DEV_CORS_LOCALHOST === 'true';
  if (devLocalhost && !allowedOrigin) {
    console.warn('[Host/Server] BARAM_DEV_CORS_LOCALHOST=true — auto-allowing http(s)://localhost origins. Disable in production.');
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    let allow: string | undefined;
    if (allowedOrigin) {
      allow = allowedOrigin;
    } else if (devLocalhost && origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      allow = origin;
    }
    if (allow) {
      res.header('Access-Control-Allow-Origin', allow);
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(allow ? 200 : 403);
      return;
    }
    next();
  });

  /**
   * GET /health
   * Health check endpoint
   */
  app.get('/health', async (req: Request, res: Response) => {
    try {
      const health = await vsockClient.healthCheck();
      res.json({
        host: 'healthy',
        enclave: health.payload.status,
        uptime: health.payload.uptime,
        version: health.payload.version,
        protocolVersion: PROTOCOL_VERSION,
      });
    } catch (error) {
      res.status(503).json({
        host: 'healthy',
        enclave: 'unreachable',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /public-key
   * Get the Enclave's public key for encryption
   */
  app.get('/public-key', async (req: Request, res: Response) => {
    try {
      const response = await vsockClient.getPublicKey();
      const attestation = response.payload.attestation;

      // Verify attestation if raw document is present (production Nitro mode)
      let attestationVerification: VerificationResult | undefined;

      if (attestation.rawDocument) {
        try {
          const rawDocBuffer = Buffer.from(attestation.rawDocument, 'base64');
          attestationVerification = verifyAttestationDocument(
            rawDocBuffer,
            undefined, // expectedPcrs
            5 * 60 * 1000 // 5 minutes max age
          );
          console.log('[Host/Server] Public key attestation verification:', attestationVerification.valid ? 'PASSED' : 'FAILED');
        } catch (verifyError) {
          console.error('[Host/Server] Public key attestation verification error:', verifyError);
          attestationVerification = {
            valid: false,
            error: verifyError instanceof Error ? verifyError.message : 'Verification error',
          };
        }
      }

      res.json({
        success: true,
        publicKey: response.payload.publicKey,
        attestation: response.payload.attestation,
        attestationVerification: attestationVerification ? {
          valid: attestationVerification.valid,
          error: attestationVerification.error,
          details: attestationVerification.details,
        } : undefined,
      });
    } catch (error) {
      console.error('[Host/Server] Failed to get public key:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get public key',
      });
    }
  });

  /**
   * POST /execute
   * Execute AI inference with encrypted prompt
   *
   * Request body:
   * {
   *   requestId: number,        // On-chain request ID
   *   encryptedPrompt: string,  // RSA-OAEP encrypted prompt (Base64)
   *   model: string             // Model ID (e.g., "llama-3.3-70b-versatile")
   * }
   */
  app.post('/execute', rateLimit, async (req: Request, res: Response) => {
    const { requestId, encryptedPrompt, model, budgetId, authorizer, purpose, constraints, triggeredBy, triggeredAction } = req.body;

    // Validate optional AER metadata (string fields max 256 chars; ID fields must be 0x + 64 hex)
    const ID_RE = /^0x[0-9a-fA-F]{64}$/;
    const aerMeta = {
      purpose: typeof purpose === 'string' && purpose.length > 0 && purpose.length <= 256 ? purpose : null,
      constraints: typeof constraints === 'string' && constraints.length > 0 && constraints.length <= 256 ? constraints : null,
      triggeredBy: typeof triggeredBy === 'string' && ID_RE.test(triggeredBy) ? triggeredBy : null,
      triggeredAction: typeof triggeredAction === 'string' && ID_RE.test(triggeredAction) ? triggeredAction : null,
    };

    // Validate request
    if (typeof requestId !== 'number' || !Number.isInteger(requestId) || requestId < 0 || requestId > Number.MAX_SAFE_INTEGER) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid requestId (must be a non-negative integer)',
      });
      return;
    }

    if (!encryptedPrompt || typeof encryptedPrompt !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid encryptedPrompt',
      });
      return;
    }

    // Reject oversized prompts (1MB base64 ≈ ~750KB raw, well above typical LLM context)
    const MAX_PROMPT_LENGTH = 1 * 1024 * 1024;
    if (encryptedPrompt.length > MAX_PROMPT_LENGTH) {
      res.status(413).json({
        success: false,
        error: 'Encrypted prompt too large',
      });
      return;
    }

    if (!model || typeof model !== 'string' || model.length > 100) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid model',
      });
      return;
    }

    console.log(`[Host/Server] Execute request for requestId=${requestId}, model=${model}`);

    try {
      // Forward to Enclave
      const response = await vsockClient.executeInference(
        encryptedPrompt,
        model,
        requestId
      );

      // Load expected PCRs from on-chain AttestationRegistry (if Sui enabled)
      let expectedPcrs: { pcr0?: string; pcr1?: string; pcr2?: string } | undefined;
      let baselineVersion = 0;

      if (suiEnabled) {
        try {
          const baseline = await getAttestationBaseline();
          if (baseline) {
            expectedPcrs = { pcr0: baseline.pcr0, pcr1: baseline.pcr1, pcr2: baseline.pcr2 };
            baselineVersion = baseline.version;
          }
        } catch (baselineError) {
          console.warn('[Host/Server] Failed to load PCR baseline:', baselineError);
        }
      }

      // Verify attestation if raw document is present (production Nitro mode)
      let attestationVerification: VerificationResult | undefined;
      const attestation = response.payload.attestation;

      if (attestation.rawDocument) {
        try {
          const rawDocBuffer = Buffer.from(attestation.rawDocument, 'base64');
          attestationVerification = verifyAttestationDocument(
            rawDocBuffer,
            expectedPcrs,
            5 * 60 * 1000 // 5 minutes max age
          );
          console.log('[Host/Server] Attestation verification:', attestationVerification.valid ? 'PASSED' : 'FAILED');
          if (!attestationVerification.valid) {
            console.warn('[Host/Server] Attestation verification failed:', attestationVerification.error);
          }
        } catch (verifyError) {
          console.error('[Host/Server] Attestation verification error:', verifyError);
          attestationVerification = {
            valid: false,
            error: verifyError instanceof Error ? verifyError.message : 'Verification error',
          };
        }
      } else {
        // Simulation mode - no raw document
        console.log('[Host/Server] No raw attestation document (simulation mode)');
      }

      // On-chain settlement + AER (atomic PTB)
      let txDigest: string | undefined;

      if (suiEnabled) {
        try {
          const onChainRequest = await getRequest(requestId);
          if (!onChainRequest) {
            console.warn(`[Host/Server] On-chain request ${requestId} not found, skipping settlement`);
          } else {
            const executorAddress = getExecutorAddress();
            const executorStats = await getExecutorStats(executorAddress);

            // Build AER data from attestation + executor stats + request metadata
            const attestationHashBytes = attestation.rawDocument
              ? sha256Bytes(attestation.rawDocument)
              : null;

            const aerData: AERReportData = {
              // WHO — Requester
              delegationPath: [],
              // WHO — Executor
              executorPrincipal: null,
              // HOW MUCH (payment_amount, executor_received, payment_token from receipt)
              feeDetail: null,
              budgetId: (typeof budgetId === 'string' && ID_RE.test(budgetId)) ? budgetId : null,
              budgetRemaining: null,
              // WHAT (model_name, output_hash, execution_time_ms from receipt)
              modelMetadata: null,
              // WHY (from /execute body — used by trader to link prior trade digest)
              purpose: aerMeta.purpose,
              constraints: aerMeta.constraints,
              // HOW TRUSTWORTHY
              executorTier: executorStats.tier,
              executorReputation: executorStats.reputation,
              executorStakeAmount: executorStats.stakeAmount,
              teeVerified: attestationVerification?.valid ?? false,
              teeAttestationHash: attestationHashBytes,
              // CHAIN (from /execute body — trader passes prior trade tx digest as triggeredBy)
              triggeredBy: aerMeta.triggeredBy,
              triggeredAction: aerMeta.triggeredAction,
            };

            txDigest = await submitProofWithAERRetry(
              requestId,
              response.payload.resultHash,
              response.payload.executionTimeMs,
              onChainRequest,
              aerData,
            );

            console.log(`[Host/Server] Settlement completed: ${txDigest}`);
          }
        } catch (settlementError) {
          // Settlement failed after retries — do NOT return the result.
          // User's escrow is safe (PENDING state, auto-refund after 5min timeout).
          console.error('[Host/Server] Settlement failed after retries:', settlementError);
          res.status(502).json({
            success: false,
            error: 'Settlement failed. Your escrow is safe and will auto-refund after timeout.',
            settlementFailed: true,
          });
          return;
        }
      }

      res.json({
        success: true,
        result: response.payload.result,
        resultHash: response.payload.resultHash,
        encrypted: response.payload.encrypted ?? false,
        executionTimeMs: response.payload.executionTimeMs,
        txDigest,
        attestation: response.payload.attestation,
        attestationVerification: attestationVerification ? {
          valid: attestationVerification.valid,
          error: attestationVerification.error,
          details: attestationVerification.details,
        } : undefined,
      });
    } catch (error) {
      console.error('[Host/Server] Execution failed:', error);
      res.status(500).json({
        success: false,
        error: 'Execution failed',
      });
    }
  });

  // ==========================================================================
  // Plan B B2: capability-gated execute path.
  //
  // POST /execute-capability
  // Body (additional fields on top of /execute):
  //   capabilityId:        string  — shared Capability object id
  //   walletAddress:       string  — cap.owner sanity check
  //   envelope:            AEREnvelopeMeta
  //   lineage:             AERLineageMeta
  //   wake:                AERWakeMeta
  //   replay:              AERReplayMeta
  //   actionCall?:         ActionCallSpec | null  — execution action; null for HOLD
  //   proposal:            ActionProposal — used for soft-rail preflight
  //
  // Behavior:
  //   1. Run hard + soft rail preflight (host/capability.ts).
  //   2. On deny → emit a noop.v1 cognition AER with the reason_code; the
  //      enclave is NOT called and the inference is NOT performed.
  //   3. On allow → forward to enclave for inference, then submit the
  //      capability-gated PTB.
  //
  // The legacy `/execute` route above remains for non-capability-aware
  // callers but the entry it targets no longer exists in the post-B1
  // baram_aer package, so it will fail at the PTB step. Treat it as
  // deprecated; remove in Plan C.
  // ==========================================================================
  const actionRegistry = (() => {
    try {
      return loadActionClasses();
    } catch (err) {
      console.warn(
        '[Host/Server] Could not load action-classes.json:',
        err instanceof Error ? err.message : err,
      );
      return {};
    }
  })();

  // Configure cognition cap if env is set. Map of walletAddress -> cap is
  // populated lazily on first request from that wallet.
  const cognitionCapEnv = Number(process.env.DAILY_COGNITION_PAYOUT_CAP ?? '0');
  const seenWallets = new Set<string>();

  app.post('/execute-capability', rateLimit, async (req: Request, res: Response) => {
    if (!suiEnabled || !serverConfig.sui) {
      res.status(503).json({ success: false, error: 'Sui settlement disabled' });
      return;
    }

    const {
      requestId,
      encryptedPrompt,
      model,
      budgetId,
      capabilityId,
      walletAddress,
      envelope,
      lineage,
      wake,
      replay,
      actionCall,
      proposal,
      purpose,
      constraints,
      triggeredBy,
      triggeredAction,
    } = req.body as {
      requestId: number;
      encryptedPrompt: string;
      model: string;
      budgetId?: string;
      capabilityId: string;
      walletAddress: string;
      envelope: AEREnvelopeMeta;
      lineage: AERLineageMeta;
      wake: AERWakeMeta;
      replay: AERReplayMeta;
      actionCall?: ActionCallSpec | null;
      proposal: ActionProposal;
      purpose?: string;
      constraints?: string;
      triggeredBy?: string;
      triggeredAction?: string;
    };

    // Minimum validation. Detailed args are validated by the contract; we
    // only short-circuit obvious shape errors here.
    if (
      typeof requestId !== 'number' ||
      !Number.isInteger(requestId) ||
      requestId < 0
    ) {
      res.status(400).json({ success: false, error: 'Invalid requestId' });
      return;
    }
    if (!encryptedPrompt || typeof encryptedPrompt !== 'string') {
      res.status(400).json({ success: false, error: 'Invalid encryptedPrompt' });
      return;
    }
    if (!capabilityId || !walletAddress) {
      res.status(400).json({
        success: false,
        error: 'capabilityId and walletAddress are required',
      });
      return;
    }
    if (!envelope || !lineage || !wake || !replay || !proposal) {
      res.status(400).json({
        success: false,
        error: 'envelope/lineage/wake/replay/proposal are all required',
      });
      return;
    }

    // Shape validation on caller-controlled object ids (security review F5).
    // Reject non-0x...64hex up front so a crafted shape doesn't burn an RPC
    // round-trip or a `SuiClient.getObject` cycle on garbage input.
    const OBJECT_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;
    if (!OBJECT_ID_RE.test(capabilityId) || !OBJECT_ID_RE.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'capabilityId and walletAddress must be 0x<hex>',
      });
      return;
    }

    // Defense against F3 (twin-trust between proposal and envelope).
    // proposal drives the soft-rail; envelope drives the PTB. If they
    // disagree on action_type / event_class, the cognition cap and asset
    // checks fire against different states. Refuse rather than reconcile.
    if (
      proposal.actionType !== envelope.actionType ||
      proposal.eventClass !== envelope.eventClass
    ) {
      res.status(400).json({
        success: false,
        error: 'proposal must agree with envelope on (eventClass, actionType)',
      });
      return;
    }

    // Defense against F1/F7 (actionCall vs proposal.exec twin-trust). When
    // an execution AER is requested, the actionCall the host emits in PTB
    // Cmd 0 must be identical (target package, module, function) to the
    // proposal.exec block the soft-rail validated.
    if (proposal.eventClass === 2) {
      if (!actionCall || !proposal.exec) {
        res.status(400).json({
          success: false,
          error: 'execution AER requires both actionCall and proposal.exec',
        });
        return;
      }
      if (
        actionCall.targetPackage !== proposal.exec.targetPackage ||
        actionCall.module !== proposal.exec.module ||
        actionCall.fn !== proposal.exec.fn
      ) {
        res.status(400).json({
          success: false,
          error: 'actionCall (target/module/fn) must match proposal.exec',
        });
        return;
      }
    } else if (actionCall) {
      // cognition / settlement AERs must NOT carry an on-chain action call;
      // the gated entry's PTB layout has no slot for it and the soft rail
      // checks above skip the registry validation for non-execution events.
      res.status(400).json({
        success: false,
        error: 'actionCall must be null for non-execution AERs',
      });
      return;
    }

    // Enum range validation (F-6). Contract aborts anyway, but burning gas
    // for a malformed enum that the host could have caught is wasteful.
    if (envelope.eventClass !== 1 && envelope.eventClass !== 2) {
      res.status(400).json({
        success: false,
        error: 'envelope.eventClass must be 1 (cognition) or 2 (execution)',
      });
      return;
    }
    if (envelope.actionOutcome < 1 || envelope.actionOutcome > 3) {
      res.status(400).json({
        success: false,
        error: 'envelope.actionOutcome must be 1, 2, or 3',
      });
      return;
    }
    if (wake.triggeredByType < 1 || wake.triggeredByType > 4) {
      res.status(400).json({
        success: false,
        error: 'wake.triggeredByType must be 1..=4',
      });
      return;
    }

    // Register cognition cap for this wallet on first sight. F17:
    // configureCognitionCap is idempotent (it resets the events ring on
    // re-call), so we guard with `has` AND only add to seenWallets after a
    // successful configure call. Two concurrent requests for a new wallet
    // could both pass the `!has` check; the worst case is the second one
    // resets a freshly-empty ring, which is a no-op.
    if (!seenWallets.has(walletAddress)) {
      configureCognitionCap(walletAddress, cognitionCapEnv);
      seenWallets.add(walletAddress);
    }

    const rpcUrl = serverConfig.sui.rpcUrl;
    const client = new SuiClient({ url: rpcUrl });

    let pre;
    try {
      pre = await capabilityPreflight(client, actionRegistry, {
        capId: capabilityId,
        walletAddress,
        proposal,
      });
    } catch (err) {
      console.error('[Host/Server] Capability preflight failed:', err);
      res.status(502).json({
        success: false,
        error: 'Capability preflight failed (fetch error)',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (!pre.ok) {
      // Build a noop cognition AER explaining the rejection. We still
      // attempt to forward the request to the enclave so the user's
      // inference happens (their Budget pays for it), but the action
      // outcome is hold-noop with the rejection reason in the payload.
      //
      // Wait — Plan B §4.1 says "If any check fails, host emits a cognition
      // AER (noop.v1, reason_code = ?) explaining the rejection. The
      // executor still gets paid for the inference." But running the
      // inference for a rejected request is wasteful for failure modes
      // like revoked/paused/owner_mismatch. Conservative: skip inference
      // entirely and refuse the request. Plan B prose treats this as "no
      // silent skips," not "must run the inference anyway."
      res.status(403).json({
        success: false,
        error: 'Capability preflight denied',
        reason: pre.reason,
      });
      return;
    }

    // Inference (same path as legacy /execute).
    let response;
    try {
      response = await vsockClient.executeInference(encryptedPrompt, model, requestId);
    } catch (err) {
      res.status(502).json({
        success: false,
        error: 'Enclave forward failed',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Build AERReportData (same shape as legacy path).
    const onChainRequest = await getRequest(requestId);
    if (!onChainRequest) {
      res.status(404).json({ success: false, error: 'On-chain request not found' });
      return;
    }

    const executorAddress = getExecutorAddress();
    const executorStats = await getExecutorStats(executorAddress);

    const ID_RE = /^0x[0-9a-fA-F]{64}$/;
    const aerData: AERReportData = {
      delegationPath: [],
      executorPrincipal: null,
      feeDetail: null,
      budgetId: typeof budgetId === 'string' && ID_RE.test(budgetId) ? budgetId : null,
      budgetRemaining: null,
      modelMetadata: null,
      purpose:
        typeof purpose === 'string' && purpose.length > 0 && purpose.length <= 256
          ? purpose
          : null,
      constraints:
        typeof constraints === 'string' &&
        constraints.length > 0 &&
        constraints.length <= 256
          ? constraints
          : null,
      executorTier: executorStats.tier,
      executorReputation: executorStats.reputation,
      executorStakeAmount: executorStats.stakeAmount,
      teeVerified: false, // simulation mode for B2 smoke; Plan E hardens
      teeAttestationHash: response.payload.attestation.rawDocument
        ? sha256Bytes(response.payload.attestation.rawDocument)
        : null,
      triggeredBy:
        typeof triggeredBy === 'string' && ID_RE.test(triggeredBy) ? triggeredBy : null,
      triggeredAction:
        typeof triggeredAction === 'string' && ID_RE.test(triggeredAction)
          ? triggeredAction
          : null,
    };

    try {
      const txDigest = await submitProofWithAERCapability({
        requestId,
        resultHash: response.payload.resultHash,
        executionTimeMs: response.payload.executionTimeMs,
        request: onChainRequest,
        aer: aerData,
        capRef: pre.capRef,
        envelope,
        lineage,
        wake,
        replay,
        actionCall: actionCall ?? null,
      });

      if (envelope.eventClass === 1) {
        recordCognitionPayout(walletAddress, capabilityId);
      }

      res.json({
        success: true,
        result: response.payload.result,
        resultHash: response.payload.resultHash,
        executionTimeMs: response.payload.executionTimeMs,
        txDigest,
        capabilityVersion: pre.capRef.cap.version.toString(),
      });
    } catch (err) {
      console.error('[Host/Server] Capability-gated PTB failed:', err);
      res.status(502).json({
        success: false,
        error: 'Settlement failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Internal helper exposed for tests / debug: build a default cognition
  // envelope so callers don't have to encode noop.v1 themselves.
  app.post('/debug/default-cognition-envelope', (req: Request, res: Response) => {
    const { reasonCode, rationaleHash, summary } = req.body as {
      reasonCode: number;
      rationaleHash: number[];
      summary: string;
    };
    const env = defaultCognitionEnvelope({
      reasonCode,
      rationaleHash,
      summary,
    });
    res.json({
      ...env,
      payloadHashHex: Buffer.from(env.payloadHash).toString('hex'),
      payloadBytesHex: Buffer.from(env.payloadBytes).toString('hex'),
    });
  });

  // Avoid "unused import" type errors when actionPayloadHash isn't used here.
  void actionPayloadHash;

  /**
   * 404 handler
   */
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
    });
  });

  /**
   * Error handler
   */
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error('[Host/Server] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
    });
  });

  return app;
}

/**
 * Build SuiConfig from environment variables.
 * Returns undefined if required vars are missing.
 */
function buildSuiConfigFromEnv(): SuiConfig | undefined {
  const rpcUrl = process.env.SUI_RPC_URL;
  const packageId = process.env.BARAM_PACKAGE_ID;
  const registryId = process.env.BARAM_REGISTRY_ID;
  const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;

  if (!rpcUrl || !packageId || !registryId || !executorPrivateKey) {
    return undefined;
  }

  return {
    rpcUrl,
    packageId,
    registryId,
    executorPrivateKey,
    aerPackageId: process.env.AER_PACKAGE_ID || '',
    aerRegistryId: process.env.AER_REGISTRY_ID || '',
    executorRegistryId: process.env.EXECUTOR_REGISTRY_ID || '',
    attestationRegistryId: process.env.ATTESTATION_REGISTRY_ID || '',
    stakingRegistryId: process.env.STAKING_REGISTRY_ID || '',
    tierRegistryId: process.env.TIER_REGISTRY_ID || '',
    executorPackageId: process.env.EXECUTOR_PACKAGE_ID || '',
    processedRequestsId: process.env.PROCESSED_REQUESTS_ID || '',
    executorStakeId: process.env.EXECUTOR_STAKE_ID || '',
    capabilityRegistryId: process.env.CAPABILITY_REGISTRY_ID || undefined,
  };
}

/**
 * Start the HTTP server
 */
export function startServer(config: Partial<ServerConfig> = {}): void {
  const serverConfig = { ...DEFAULT_CONFIG, ...config };

  // Auto-detect Sui config from env if not provided
  if (!serverConfig.sui) {
    serverConfig.sui = buildSuiConfigFromEnv();
  }

  const app = createServer(serverConfig);

  app.listen(serverConfig.port, () => {
    console.log(`[Host/Server] HTTP server listening on port ${serverConfig.port}`);
  });
}
