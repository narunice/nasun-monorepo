/**
 * E2E Test Setup and Utilities
 *
 * Provides test helpers for running E2E tests against Nasun devnet.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { BaramClient } from '../client';
import { createDevnetConfig } from '../config';

const config = createDevnetConfig();

// Generate deterministic keypairs for testing (seeded from test names)
// This ensures consistent addresses across test runs
function generateTestKeypair(seed: string): Ed25519Keypair {
  // Create a deterministic seed from the string
  const encoder = new TextEncoder();
  const seedBytes = encoder.encode(seed.padEnd(32, '0').slice(0, 32));
  return Ed25519Keypair.fromSecretKey(seedBytes);
}

// Test keypairs - deterministic for reproducibility
export const TEST_USER_KEYPAIR = generateTestKeypair('baram-e2e-test-user-v1');
export const TEST_AGENT_KEYPAIR = generateTestKeypair('baram-e2e-test-agent-v1');

export const TEST_USER_ADDRESS = TEST_USER_KEYPAIR.toSuiAddress();
export const TEST_AGENT_ADDRESS = TEST_AGENT_KEYPAIR.toSuiAddress();

/**
 * Create a BaramClient for the test user (Budget owner)
 */
export function createUserClient(): BaramClient {
  return new BaramClient({
    config,
    signer: TEST_USER_KEYPAIR,
    executorTimeoutMs: 60000, // 60s for AI inference
    ecrPollIntervalMs: 3000,
    ecrPollRetries: 5,
  });
}

/**
 * Create a BaramClient for the test agent (Budget consumer)
 */
export function createAgentClient(): BaramClient {
  return new BaramClient({
    config,
    signer: TEST_AGENT_KEYPAIR,
    executorTimeoutMs: 60000,
    ecrPollIntervalMs: 3000,
    ecrPollRetries: 5,
  });
}

/**
 * Request tokens from faucet for a given address
 */
export async function requestFaucet(address: string): Promise<void> {
  const faucetUrl = 'https://faucet.devnet.nasun.io/gas';

  const response = await fetch(faucetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      FixedAmountRequest: { recipient: address },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Faucet request failed: ${response.status} - ${text}`);
  }

  // Wait for transaction to be processed
  await sleep(2000);
}

/**
 * Request NUSDC tokens from Token Faucet
 */
export async function requestNusdcFaucet(client: BaramClient): Promise<string> {
  const suiClient = new SuiClient({ url: config.rpcUrl });

  // Token faucet details from devnet-ids.json
  const tokenFaucetId = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
  const tokensPackageId = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';

  const { Transaction } = await import('@mysten/sui/transactions');
  const tx = new Transaction();

  // Call request_nusdc function from devnet_tokens::faucet module
  tx.moveCall({
    target: `${tokensPackageId}::faucet::request_nusdc`,
    arguments: [tx.object(tokenFaucetId)],
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: client['signer'], // Access private signer
  });

  await suiClient.waitForTransaction({ digest: result.digest });
  return result.digest;
}

/**
 * Ensure the client has sufficient NUSDC balance
 * If balance is below minBalance, request from faucet
 */
export async function ensureNusdcBalance(
  client: BaramClient,
  minBalance: number = 10_000_000, // 10 NUSDC default
): Promise<void> {
  const balance = await client.getBalance();

  if (balance < minBalance) {
    console.log(`Balance ${balance} < ${minBalance}, requesting from faucet...`);

    // First ensure we have gas (native token)
    await requestFaucet(client.getAddress());

    // Then claim NUSDC
    await requestNusdcFaucet(client);

    // Verify balance increased
    const newBalance = await client.getBalance();
    console.log(`New NUSDC balance: ${newBalance}`);

    if (newBalance < minBalance) {
      throw new Error(`Failed to get sufficient NUSDC balance. Have: ${newBalance}, need: ${minBalance}`);
    }
  }
}

/**
 * Wait for a transaction to be confirmed
 */
export async function waitForTransaction(digest: string): Promise<void> {
  const suiClient = new SuiClient({ url: config.rpcUrl });
  await suiClient.waitForTransaction({ digest, timeout: 30000 });
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Log test info with timestamp
 */
export function logTest(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Format NUSDC amount (6 decimals) for display
 */
export function formatNusdc(amount: number): string {
  return `${(amount / 1_000_000).toFixed(6)} NUSDC`;
}
