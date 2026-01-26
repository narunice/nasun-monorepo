/**
 * Debug Main - Step-by-step debugging of main.ts initialization
 */

// Static imports at top level
import * as net from 'net';
import {
  useOpenAIProxy,
  isNitroMode,
} from '../shared/protocol.js';
import { isVsockMode } from '../shared/vsock.js';
import { initializeCrypto } from './crypto.js';
import { initializeInferenceProxy, type OpenAIProxyFunction } from './inference.js';

console.log('[DEBUG] === Step 1: Script starting ===');
console.log('[DEBUG] === Step 2: All imports successful (static imports) ===');

async function main() {
  try {
    // Check environment
    console.log('[DEBUG] === Step 3: Environment check ===');
    console.log(`[DEBUG]   USE_VSOCK=${process.env.USE_VSOCK}`);
    console.log(`[DEBUG]   USE_OPENAI_PROXY=${process.env.USE_OPENAI_PROXY}`);
    console.log(`[DEBUG]   NITRO_MODE=${process.env.NITRO_MODE}`);
    console.log(`[DEBUG]   ENCLAVE_PORT=${process.env.ENCLAVE_PORT}`);
    console.log(`[DEBUG]   useOpenAIProxy()=${useOpenAIProxy()}`);
    console.log(`[DEBUG]   isNitroMode()=${isNitroMode()}`);
    console.log(`[DEBUG]   isVsockMode()=${isVsockMode()}`);

    // Test crypto initialization
    console.log('[DEBUG] === Step 4: Testing crypto initialization ===');
    const publicKey = await initializeCrypto();
    console.log(`[DEBUG]   Crypto initialized, publicKey starts with: ${publicKey.substring(0, 20)}...`);

    // Test inference proxy initialization
    console.log('[DEBUG] === Step 5: Testing inference proxy initialization ===');
    const dummyProxy: OpenAIProxyFunction = async () => {
      return { success: true, result: 'test' };
    };
    initializeInferenceProxy(dummyProxy);
    console.log('[DEBUG]   Inference proxy initialized');

    // Start TCP server
    console.log('[DEBUG] === Step 6: Starting TCP server ===');
    const PORT = 5050;

    const server = net.createServer((socket) => {
      console.log('[DEBUG] Client connected');
      socket.on('data', (data) => {
        console.log('[DEBUG] Received:', data.toString().substring(0, 100));
        socket.write('{"type":"HEALTH_STATUS","success":true}\n');
      });
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[DEBUG] Server listening on port ${PORT}`);
    });

    server.on('error', (err) => {
      console.error('[DEBUG] Server error:', err);
    });

    // Heartbeat
    setInterval(() => {
      console.log('[DEBUG] Heartbeat - Enclave running OK');
    }, 10000);

    console.log('[DEBUG] === Step 7: Initialization complete ===');
    console.log('[DEBUG] Enclave is ready and waiting for connections');

  } catch (error) {
    console.error('[DEBUG] FATAL ERROR:', error);
    console.error('[DEBUG] Stack:', error instanceof Error ? error.stack : 'N/A');
    process.exit(1);
  }
}

main();
