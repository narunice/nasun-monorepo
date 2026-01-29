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

/**
 * HTTP Server configuration
 */
interface ServerConfig {
  port: number;
  enclaveHost: string;
  enclavePort: number;
}

const DEFAULT_CONFIG: ServerConfig = {
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

  // Middleware
  app.use(express.json());

  // CORS for local development
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
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
        error: error instanceof Error ? error.message : 'Failed to get public key',
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
   *   model: string             // Model ID (e.g., "gpt-4o-mini")
   * }
   */
  app.post('/execute', async (req: Request, res: Response) => {
    const { requestId, encryptedPrompt, model } = req.body;

    // Validate request
    if (typeof requestId !== 'number') {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid requestId',
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

    if (!model || typeof model !== 'string') {
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

      // Verify attestation if raw document is present (production Nitro mode)
      let attestationVerification: VerificationResult | undefined;
      const attestation = response.payload.attestation;

      if (attestation.rawDocument) {
        try {
          const rawDocBuffer = Buffer.from(attestation.rawDocument, 'base64');
          // TODO: Load expected PCRs from on-chain registry
          // For now, just verify signature and certificate chain
          attestationVerification = verifyAttestationDocument(
            rawDocBuffer,
            undefined, // expectedPcrs - will be loaded from on-chain in production
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

      res.json({
        success: true,
        result: response.payload.result,
        resultHash: response.payload.resultHash,
        executionTimeMs: response.payload.executionTimeMs,
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
        error: error instanceof Error ? error.message : 'Execution failed',
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
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('[Host/Server] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

/**
 * Start the HTTP server
 */
export function startServer(config: Partial<ServerConfig> = {}): void {
  const serverConfig = { ...DEFAULT_CONFIG, ...config };
  const app = createServer(config);

  app.listen(serverConfig.port, () => {
    console.log(`[Host/Server] HTTP server listening on port ${serverConfig.port}`);
  });
}
