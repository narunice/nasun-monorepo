/**
 * Host Main Entry Point
 *
 * The Host process runs outside the Enclave and handles:
 * 1. HTTP server for external requests (from Frontend/Lambda)
 * 2. vsock client for Enclave communication
 *
 * In production AWS Nitro:
 * - Host runs on EC2 instance (outside Enclave)
 * - Exposes HTTP API (behind API Gateway or load balancer)
 * - Communicates with Enclave via vsock
 *
 * In local simulation:
 * - Host runs as separate process
 * - Uses TCP instead of vsock
 */

import { startServer } from './server.js';
import { getVsockClient } from './vsock-client.js';
import { HOST_HTTP_PORT, ENCLAVE_PORT, PROTOCOL_VERSION } from '../shared/protocol.js';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Baram TEE Host (Local Simulation)');
  console.log('========================================');
  console.log(`Protocol Version: ${PROTOCOL_VERSION}`);
  console.log('');

  // Configuration from environment
  const enclaveHost = process.env.ENCLAVE_HOST || 'localhost';
  const enclavePort = parseInt(process.env.ENCLAVE_PORT || String(ENCLAVE_PORT), 10);
  const httpPort = parseInt(process.env.HOST_PORT || String(HOST_HTTP_PORT), 10);

  console.log(`Enclave Address: ${enclaveHost}:${enclavePort}`);
  console.log(`HTTP Server Port: ${httpPort}`);
  console.log('');

  // Initialize vsock client
  const vsockClient = getVsockClient({
    host: enclaveHost,
    port: enclavePort,
  });

  // Try to connect to Enclave with retry
  let connected = false;
  let retries = 0;
  const maxRetries = 10;
  const retryDelay = 2000;

  while (!connected && retries < maxRetries) {
    try {
      console.log(`[Host] Connecting to Enclave (attempt ${retries + 1}/${maxRetries})...`);
      await vsockClient.connect();
      connected = true;

      // Verify connection with health check
      const health = await vsockClient.healthCheck();
      console.log(`[Host] Enclave health: ${health.payload.status}`);
      console.log(`[Host] Enclave version: ${health.payload.version}`);
    } catch (error) {
      retries++;
      if (retries < maxRetries) {
        console.log(`[Host] Connection failed, retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.error('[Host] Failed to connect to Enclave after max retries');
        console.error('[Host] Make sure the Enclave is running: pnpm dev:enclave');
        process.exit(1);
      }
    }
  }

  // Start HTTP server
  startServer({
    port: httpPort,
    enclaveHost,
    enclavePort,
  });

  console.log('');
  console.log('[Host] Ready to receive requests');
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  http://localhost:${httpPort}/health       - Health check`);
  console.log(`  GET  http://localhost:${httpPort}/public-key   - Get Enclave public key`);
  console.log(`  POST http://localhost:${httpPort}/execute      - Execute AI inference`);
  console.log('');

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Host] Shutting down...');
    vsockClient.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[Host] Fatal error:', error);
  process.exit(1);
});
