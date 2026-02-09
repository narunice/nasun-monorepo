/**
 * E2E Test Setup for baram-aer-sdk
 *
 * Read-only SDK — no signer or faucet needed.
 * Tests use existing AER records on devnet created by baram-sdk E2E tests.
 */

import { SuiClient } from '@mysten/sui/client';
import { AERClient } from '../client';
import { createDevnetConfig } from '../config';

export const config = createDevnetConfig();

export function createAERClient(): AERClient {
  return new AERClient({ config });
}

export function createSuiClient(): SuiClient {
  return new SuiClient({ url: config.rpcUrl });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function logTest(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}
