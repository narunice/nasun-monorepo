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
  sha256Bytes,
  type SuiConfig,
  type AERReportData,
} from './sui-client.js';

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

  // CORS — fail-secure: no CORS headers unless explicitly configured
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;
  if (allowedOrigin) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', allowedOrigin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }

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
    const { requestId, encryptedPrompt, model, budgetId, authorizer } = req.body;

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
              authorizer: (typeof authorizer === 'string' && authorizer) || onChainRequest.requester,
              delegationPath: [],
              // WHO — Executor
              executorPrincipal: null,
              // HOW MUCH
              paymentToken: 0, // NUSDC
              executorReceived: onChainRequest.price, // No fee split yet
              feeDetail: null,
              budgetId: (typeof budgetId === 'string' && budgetId) || null,
              budgetRemaining: null,
              // WHAT
              modelMetadata: null,
              // WHY
              purpose: null,
              policyVersion: null,
              constraints: null,
              // HOW TRUSTWORTHY
              executorTier: executorStats.tier,
              executorReputation: executorStats.reputation,
              executorStakeAmount: executorStats.stakeAmount,
              teeVerified: attestationVerification?.valid ?? false,
              teeAttestationHash: attestationHashBytes,
              // CHAIN
              triggeredBy: null,
              triggeredAction: null,
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
