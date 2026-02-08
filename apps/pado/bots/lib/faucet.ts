/**
 * Faucet Module
 *
 * Handles token faucet requests for auto-refill.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { TOKENS_PACKAGE, TOKEN_FAUCET, FAUCET_URL, timestamp } from './config.js';

// ========================================
// Faucet Transaction Builders
// ========================================

/**
 * Build transaction to request both NBTC and NUSDC
 * Uses legacy function (no cooldown)
 */
export function buildRequestTokens(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${TOKENS_PACKAGE}::faucet::request_tokens`,
    arguments: [tx.object(TOKEN_FAUCET)],
  });

  return tx;
}

/**
 * Build transaction to request NBTC only
 */
export function buildRequestNbtc(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${TOKENS_PACKAGE}::faucet::request_nbtc`,
    arguments: [tx.object(TOKEN_FAUCET)],
  });

  return tx;
}

/**
 * Build transaction to request NUSDC only
 */
export function buildRequestNusdc(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${TOKENS_PACKAGE}::faucet::request_nusdc`,
    arguments: [tx.object(TOKEN_FAUCET)],
  });

  return tx;
}

// ========================================
// Native Gas Faucet (HTTP API)
// ========================================

/**
 * Request native gas coins (NASUN) from faucet via HTTP API.
 * This is separate from token faucet — it hits the /gas endpoint directly.
 */
export async function requestGas(address: string): Promise<boolean> {
  try {
    const response = await fetch(`${FAUCET_URL}/gas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        FixedAmountRequest: { recipient: address },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${timestamp()}] Gas faucet request failed: ${response.status} ${errorText}`);
      return false;
    }

    console.log(`[${timestamp()}] Received gas from faucet`);

    // Wait for gas to be indexed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting gas from faucet:`, error);
    return false;
  }
}

// ========================================
// Faucet Execution
// ========================================

/**
 * Request tokens from faucet
 * Returns: 1 NBTC + 100,000 NUSDC on success
 * Waits for transaction finalization to ensure tokens are indexed
 */
export async function requestTokens(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  const tx = buildRequestTokens();

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error(`[${timestamp()}] Faucet request failed:`, result.effects?.status?.error);
      return false;
    }

    console.log(`[${timestamp()}] Received tokens from faucet (1 NBTC + 100k NUSDC)`);

    // Wait for transaction to be fully indexed
    await client.waitForTransaction({
      digest: result.digest,
      options: { showEffects: true },
    });

    // Additional delay for RPC indexing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting from faucet:`, error);
    return false;
  }
}

/**
 * Request NBTC only from faucet
 * Returns: 1 NBTC on success
 */
export async function requestNbtc(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  const tx = buildRequestNbtc();

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error(`[${timestamp()}] NBTC faucet request failed:`, result.effects?.status?.error);
      return false;
    }

    console.log(`[${timestamp()}] Received 1 NBTC from faucet`);
    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting NBTC from faucet:`, error);
    return false;
  }
}

/**
 * Request NUSDC only from faucet
 * Returns: 100,000 NUSDC on success
 */
export async function requestNusdc(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  const tx = buildRequestNusdc();

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error(`[${timestamp()}] NUSDC faucet request failed:`, result.effects?.status?.error);
      return false;
    }

    console.log(`[${timestamp()}] Received 100k NUSDC from faucet`);
    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting NUSDC from faucet:`, error);
    return false;
  }
}
