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
  submitProofWithAERCapability,
  defaultCognitionEnvelope,
  actionPayloadHash,
  type SuiConfig,
  type AERReportData,
  type AEREnvelopeMeta,
  type AERLineageMeta,
  type AERWakeMeta,
  type AERReplayMeta,
  type ActionCallSpec,
  type ExecutionPlanInput,
} from './sui-client.js';
import {
  preflight as capabilityPreflight,
  fetchCapability,
  recordCognitionPayout,
  configureCognitionCap,
  type ActionProposal,
} from './capability.js';
import { loadActionClasses, findFunctionEntry } from './action-classes.js';
import { mintToken, verifyToken } from './spend-token.js';
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

  // In-memory rate limiter for /execute-capability (no external dependency)
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
   * POST /execute — REMOVED (Plan C, F16).
   *
   * The pre-Plan-B ungated AER entry path was removed when the AER package
   * was republished in B1; `submit_proof_with_receipt -> create_report_with_
   * receipt` now only accepts settlement-class AERs. Routing arbitrary
   * cognition/execution inferences through it would have produced unrecoverable
   * PTB rollbacks (receipt destroyed but AER refused) and bypassed all the
   * capability hard rails. Callers must use `/execute-capability` instead and
   * supply an envelope/lineage/wake/replay block.
   *
   * The 410 Gone response includes a `migration` field so the dashboard can
   * surface a clear migration message to the user instead of bubbling up a
   * generic 404.
   */
  app.post('/execute', (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'POST /execute is removed. Use POST /execute-capability.',
      migration: {
        replacementEndpoint: '/execute-capability',
        reason:
          'capability-gated AER is required after the Plan B republish; the legacy AER entry no longer accepts cognition/execution events.',
        docs: 'apps/baram/docs/smoke-b2-runbook.md',
      },
    });
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
  // populated lazily on first request from that wallet. We bound the
  // `seenWallets` set to avoid unbounded memory growth on a host that has
  // been up for months — the cognition tracker itself is already keyed by
  // walletAddress so a wallet falling out of `seenWallets` just means its
  // next request re-runs `configureCognitionCap`, which is idempotent.
  const cognitionCapEnv = Number(process.env.DAILY_COGNITION_PAYOUT_CAP ?? '0');
  const SEEN_WALLETS_LIMIT = 10_000;
  const seenWallets = new Map<string, true>();

  // Shared SuiClient for preflight reads. The capability-gated PTB path uses
  // the keypair-bound client in sui-client.ts; this one is RPC-only and
  // re-used across requests so we don't pay the per-request `new SuiClient`
  // overhead (each constructor opens an HTTP keepalive pool). F5 from the
  // B2 review punch list.
  let preflightClient: SuiClient | null = null;
  function getPreflightClient(): SuiClient {
    if (!preflightClient) {
      if (!serverConfig.sui) {
        throw new Error('Sui config missing — preflight client unavailable');
      }
      preflightClient = new SuiClient({ url: serverConfig.sui.rpcUrl });
    }
    return preflightClient;
  }

  // ==========================================================================
  // POST /infer (Plan C C3-v2 §4.2)
  //
  // Runs preflight + enclave inference and returns an HMAC-bound spend
  // token. Does NOT mutate chain state. Trader echoes the token + result
  // hash back via /execute-capability.
  // ==========================================================================
  app.post('/infer', rateLimit, async (req: Request, res: Response) => {
    if (!suiEnabled || !serverConfig.sui) {
      res.status(503).json({ success: false, error: 'Sui settlement disabled' });
      return;
    }
    const { requestId, encryptedPrompt, model, capabilityId, walletAddress } =
      req.body as {
        requestId: number;
        encryptedPrompt: string;
        model: string;
        capabilityId: string;
        walletAddress: string;
      };

    if (typeof requestId !== 'number' || !Number.isInteger(requestId) || requestId < 0) {
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
    const OBJECT_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;
    if (!OBJECT_ID_RE.test(capabilityId) || !OBJECT_ID_RE.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'capabilityId and walletAddress must be 0x<hex>',
      });
      return;
    }

    // Lightweight preflight: cap state only. The full proposal-based
    // preflight runs at /execute-capability where the host has the
    // envelope + action shape. Here we just refuse to spend the
    // enclave on a wallet that doesn't own the cap, or on a paused /
    // revoked cap.
    const client = getPreflightClient();
    try {
      const capRef = await fetchCapability(client, capabilityId);
      if (capRef.cap.revoked) {
        res.status(403).json({ success: false, error: 'preflight', reason: 'revoked' });
        return;
      }
      if (capRef.cap.pauseMode !== 'active') {
        res.status(403).json({ success: false, error: 'preflight', reason: 'paused' });
        return;
      }
      if (capRef.cap.owner !== walletAddress) {
        res.status(403).json({ success: false, error: 'preflight', reason: 'owner_mismatch' });
        return;
      }
    } catch (err) {
      res.status(502).json({
        success: false,
        error: 'Capability fetch failed',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let inferResp;
    try {
      inferResp = await vsockClient.executeInference(encryptedPrompt, model, requestId);
    } catch (err) {
      res.status(502).json({
        success: false,
        error: 'Enclave forward failed',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const tok = mintToken({
      requestId,
      resultHash: inferResp.payload.resultHash,
      walletAddress,
    });

    res.json({
      success: true,
      result: inferResp.payload.result,
      resultHash: inferResp.payload.resultHash,
      executionTimeMs: inferResp.payload.executionTimeMs,
      spendToken: tok.spendToken,
      nonce: tok.nonce,
      expiresAt: tok.expiresAt,
    });
  });

  app.post('/execute-capability', rateLimit, async (req: Request, res: Response) => {
    if (!suiEnabled || !serverConfig.sui) {
      res.status(503).json({ success: false, error: 'Sui settlement disabled' });
      return;
    }

    const {
      requestId,
      resultHash,
      executionTimeMs,
      spendToken,
      nonce,
      expiresAt,
      budgetId,
      capabilityId,
      walletAddress,
      envelope,
      lineage,
      wake,
      replay,
      actionCall,
      escrow,
      spend,
      proposal,
      purpose,
      constraints,
      triggeredBy,
      triggeredAction,
    } = req.body as {
      requestId: number;
      resultHash: string;
      executionTimeMs: number;
      spendToken: string;
      nonce: string;
      expiresAt: number;
      budgetId?: string;
      capabilityId: string;
      walletAddress: string;
      envelope: AEREnvelopeMeta;
      lineage: AERLineageMeta;
      wake: AERWakeMeta;
      replay: AERReplayMeta;
      actionCall?: ActionCallSpec | null;
      escrow?: {
        objectId: string;
        initialSharedVersion: string;
        capabilityId: string;
      } | null;
      spend?: { coinAssetType: string; amount: string } | null;
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
    if (typeof resultHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(resultHash)) {
      res.status(400).json({ success: false, error: 'Invalid resultHash' });
      return;
    }
    if (typeof executionTimeMs !== 'number' || !Number.isFinite(executionTimeMs)) {
      res.status(400).json({ success: false, error: 'Invalid executionTimeMs' });
      return;
    }
    if (
      typeof spendToken !== 'string' ||
      typeof nonce !== 'string' ||
      typeof expiresAt !== 'number'
    ) {
      res.status(400).json({ success: false, error: 'Missing spend token fields' });
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
      // Reconstruct typed ActionCallArgs from the wire shape (base64
      // pure bytes -> Uint8Array). Mutate in place so downstream PTB
      // builder sees the strongly-typed form.
      for (const arg of actionCall.args ?? []) {
        if (arg && (arg as { kind: string }).kind === 'pure') {
          const wire = arg as unknown as { kind: 'pure'; bytes: unknown };
          if (typeof wire.bytes === 'string') {
            (arg as unknown as { bytes: Uint8Array }).bytes = Uint8Array.from(
              Buffer.from(wire.bytes, 'base64'),
            );
          }
        }
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
      if (!escrow || !spend) {
        res.status(400).json({
          success: false,
          error: 'execution AER requires escrow and spend blocks',
        });
        return;
      }
      if (
        !OBJECT_ID_RE.test(escrow.objectId) ||
        !OBJECT_ID_RE.test(escrow.capabilityId) ||
        escrow.capabilityId !== capabilityId
      ) {
        res.status(400).json({
          success: false,
          error: 'escrow.objectId/capabilityId malformed or cap mismatch',
        });
        return;
      }
      if (
        typeof escrow.initialSharedVersion !== 'string' ||
        !/^[0-9]+$/.test(escrow.initialSharedVersion)
      ) {
        res.status(400).json({
          success: false,
          error: 'escrow.initialSharedVersion must be a non-negative integer string',
        });
        return;
      }
      if (typeof spend?.amount !== 'string' || !/^[0-9]+$/.test(spend.amount)) {
        res.status(400).json({
          success: false,
          error: 'spend.amount must be a non-negative integer string',
        });
        return;
      }
      if (
        typeof spend.coinAssetType !== 'string' ||
        typeof spend.amount !== 'string' ||
        spend.coinAssetType !== proposal.exec.inputAssetType
      ) {
        res.status(400).json({
          success: false,
          error: 'spend.coinAssetType must match proposal.exec.inputAssetType',
        });
        return;
      }
      // Cross-rail: `spend.amount` is what `withdraw_for_action<T>` actually
      // pulls from the escrow in PTB Cmd 0. The soft rail evaluates
      // `proposal.exec.inputAmount` against `cap.maxNotionalPerTrade`. If
      // the two diverge, the notional cap is decorative and a compromised
      // trader can drain up to the escrow balance in a single AER (security
      // review 2026-05-13 finding #1). Enforce strict equality.
      const proposalInputAmountStr = String(proposal.exec.inputAmount);
      if (!/^[0-9]+$/.test(proposalInputAmountStr)) {
        res.status(400).json({
          success: false,
          error: 'proposal.exec.inputAmount must be a non-negative integer',
        });
        return;
      }
      try {
        if (BigInt(spend.amount) !== BigInt(proposalInputAmountStr)) {
          res.status(400).json({
            success: false,
            error: 'spend.amount must equal proposal.exec.inputAmount',
          });
          return;
        }
      } catch {
        res.status(400).json({
          success: false,
          error: 'spend.amount / proposal.exec.inputAmount not parseable as bigint',
        });
        return;
      }

      // Structural validation of actionCall.args (security review finding
      // #2). The trader supplies the swap call's positional args; without
      // this check, the `min_out` pure arg in `args[?]` would not be
      // bounded by `proposal.exec.maxSlippageBps`. We pin the pipe wiring
      // and the trusted-object positions; the `min_out` value itself
      // remains caller-controlled in v1 (host has no price oracle yet)
      // and is bounded only by `cap.maxNotionalPerTrade` × pool execution
      // (Plan F / phase-2 mitigation: host-derived `min_out` against a
      // mid-price reader before composing the swap).
      const fnEntryForCheck = findFunctionEntry(
        actionRegistry,
        proposal.actionType,
        proposal.exec.targetPackage,
        proposal.exec.module,
        proposal.exec.fn,
      );
      if (!fnEntryForCheck) {
        res.status(400).json({
          success: false,
          error: 'action function not registered',
        });
        return;
      }
      if (fnEntryForCheck.poolId !== proposal.exec.poolId) {
        res.status(400).json({
          success: false,
          error: 'proposal.exec.poolId does not match registry',
        });
        return;
      }
      const inputPipe = actionCall.args[fnEntryForCheck.inputCoinArg];
      const deepPipe = actionCall.args[fnEntryForCheck.deepCoinArg];
      if (
        !inputPipe ||
        (inputPipe as { kind: string }).kind !== 'pipe' ||
        (inputPipe as { from: string }).from !== 'withdraw_coin'
      ) {
        res.status(400).json({
          success: false,
          error:
            'actionCall.args[inputCoinArg] must be {kind:"pipe", from:"withdraw_coin"}',
        });
        return;
      }
      if (
        !deepPipe ||
        (deepPipe as { kind: string }).kind !== 'pipe' ||
        (deepPipe as { from: string }).from !== 'zero_deep'
      ) {
        res.status(400).json({
          success: false,
          error:
            'actionCall.args[deepCoinArg] must be {kind:"pipe", from:"zero_deep"}',
        });
        return;
      }
      // Any other pipe arg is illegal — only withdraw_coin and zero_deep
      // are pipe sources, and they live at the two declared positions.
      let poolObjectFound = false;
      for (let i = 0; i < actionCall.args.length; i++) {
        if (i === fnEntryForCheck.inputCoinArg || i === fnEntryForCheck.deepCoinArg) {
          continue;
        }
        const a = actionCall.args[i] as { kind?: string; id?: string };
        if (a && a.kind === 'pipe') {
          res.status(400).json({
            success: false,
            error: `actionCall.args[${i}] must not be a pipe`,
          });
          return;
        }
        if (a && a.kind === 'object' && a.id === fnEntryForCheck.poolId) {
          poolObjectFound = true;
        }
      }
      if (!poolObjectFound) {
        res.status(400).json({
          success: false,
          error: 'actionCall.args must include the registered pool object id',
        });
        return;
      }
    } else if (actionCall || escrow || spend) {
      // cognition / settlement AERs must NOT carry execution-only fields.
      res.status(400).json({
        success: false,
        error: 'actionCall/escrow/spend must be omitted for non-execution AERs',
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

    // HMAC token verification (Plan C C3-v2 DV8). The /infer endpoint
    // minted (spendToken, nonce, expiresAt) bound to (requestId,
    // resultHash, walletAddress); a tampered resultHash or replayed
    // token fails closed here, before we even build the AER. This is
    // the structural fix for the inference-hash gap at the
    // /infer-/execute-capability split seam.
    const tokenVerdict = verifyToken({
      spendToken,
      nonce,
      expiresAt,
      requestId,
      resultHash,
      walletAddress,
    });
    if (!tokenVerdict.ok) {
      res.status(403).json({
        success: false,
        error: 'spend token invalid',
        reason: tokenVerdict.reason,
      });
      return;
    }

    // Register cognition cap for this wallet on first sight. F17:
    // configureCognitionCap is idempotent (it resets the events ring on
    // re-call), so we guard with `has` AND only add to seenWallets after a
    // successful configure call. Two concurrent requests for a new wallet
    // could both pass the `!has` check; the worst case is the second one
    // resets a freshly-empty ring, which is a no-op.
    //
    // F5 LRU touch: re-inserting a key into a Map moves it to "most
    // recently used" in insertion order, so when we hit the limit we drop
    // the oldest entry. The cognition tracker itself outlives this index;
    // if the dropped wallet returns later the next branch re-configures
    // with the same env cap (idempotent).
    if (seenWallets.has(walletAddress)) {
      seenWallets.delete(walletAddress);
      seenWallets.set(walletAddress, true);
    } else {
      configureCognitionCap(walletAddress, cognitionCapEnv);
      seenWallets.set(walletAddress, true);
      if (seenWallets.size > SEEN_WALLETS_LIMIT) {
        const oldest = seenWallets.keys().next().value;
        if (oldest !== undefined) seenWallets.delete(oldest);
      }
    }

    const client = getPreflightClient();

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

    // Build AERReportData. Inference happened at /infer; resultHash +
    // executionTimeMs are now caller-provided (HMAC-verified above).
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
      executorPrincipal: executorAddress,
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
      teeVerified: false, // simulation mode; Plan E hardens
      teeAttestationHash: null,
      triggeredBy:
        typeof triggeredBy === 'string' && ID_RE.test(triggeredBy) ? triggeredBy : null,
      triggeredAction:
        typeof triggeredAction === 'string' && ID_RE.test(triggeredAction)
          ? triggeredAction
          : null,
    };

    // Build execution plan from the action-classes registry for
    // execution AERs. The PTB builder needs the type args + return
    // positions + DEEP type. Done here so the builder stays a pure
    // tx-composer with no registry knowledge.
    let executionPlan: ExecutionPlanInput | null = null;
    if (proposal.eventClass === 2 && proposal.exec && actionCall && escrow && spend) {
      const fnEntry = findFunctionEntry(
        actionRegistry,
        proposal.actionType,
        proposal.exec.targetPackage,
        proposal.exec.module,
        proposal.exec.fn,
      );
      const cls = actionRegistry[proposal.actionType];
      if (!fnEntry || !cls) {
        res.status(500).json({
          success: false,
          error: 'Action class not found post-preflight',
        });
        return;
      }
      executionPlan = {
        escrow: {
          objectId: escrow.objectId,
          initialSharedVersion: BigInt(escrow.initialSharedVersion),
          capabilityId: escrow.capabilityId,
        },
        spend: {
          inputAssetType: spend.coinAssetType,
          amount: BigInt(spend.amount),
        },
        outputAssetType: proposal.exec.outputAssetType,
        deepType: cls.deepType,
        outputCoinResult: fnEntry.outputCoinResult,
        expectedCapabilityVersion: pre.capRef.cap.version,
      };
    }

    try {
      const txDigest = await submitProofWithAERCapability({
        requestId,
        resultHash,
        executionTimeMs,
        request: onChainRequest,
        aer: aerData,
        capRef: pre.capRef,
        envelope,
        lineage,
        wake,
        replay,
        actionCall: actionCall ?? null,
        execution: executionPlan,
      });

      if (envelope.eventClass === 1) {
        recordCognitionPayout(walletAddress, capabilityId);
      }

      res.json({
        success: true,
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
