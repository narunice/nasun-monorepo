/**
 * Faucet Module
 *
 * Handles token faucet requests for auto-refill.
 * Supports V1 faucet (NBTC/NUSDC) and V2 faucet (NETH/NSOL).
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  TOKENS_PACKAGE,
  TOKEN_FAUCET,
  FAUCET_URL,
  MARKET,
  timestamp,
} from './config.js';

// ========================================
// V1 Faucet (NBTC + NUSDC, no cooldown)
// ========================================

function buildRequestTokensV1(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${TOKENS_PACKAGE}::faucet::request_tokens`,
    arguments: [tx.object(TOKEN_FAUCET)],
  });
  return tx;
}

function buildRequestNusdcOnly(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${TOKENS_PACKAGE}::faucet::request_nusdc`,
    arguments: [tx.object(TOKEN_FAUCET)],
  });
  return tx;
}

// ========================================
// V2 Faucet (per-market package/object)
// ========================================

function buildRequestTokensV2(): Transaction {
  const pkg = MARKET.faucetV2Package;
  const obj = MARKET.faucetV2Object;
  if (!pkg || !obj) {
    throw new Error(`V2 faucet not configured for market ${MARKET.name}`);
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::faucet_v2::request_tokens`,
    arguments: [tx.object(obj)],
  });
  return tx;
}

// ========================================
// Native Gas Faucet (HTTP API)
// ========================================

/**
 * Request native gas coins (NASUN) from faucet via HTTP API.
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
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting gas from faucet:`, error);
    return false;
  }
}

// ========================================
// Market-aware Faucet Execution
// ========================================

/**
 * Request base + quote tokens for the current market.
 *
 * - NBTC market: V1 faucet (gives 1 NBTC + 100k NUSDC)
 * - NETH/NSOL market: V2 faucet (gives 10 NETH + 100 NSOL) + V1 NUSDC faucet
 */
export async function requestTokens(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  if (MARKET.faucetType === 'v1') {
    return executeRequestTokensV1(client, keypair);
  } else {
    // V2 markets need two faucet calls: base from V2, quote (NUSDC) from V1
    const baseSuccess = await executeRequestTokensV2(client, keypair);
    if (!baseSuccess) return false;

    const quoteSuccess = await executeRequestNusdc(client, keypair);
    return quoteSuccess;
  }
}

async function executeRequestTokensV1(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  const tx = buildRequestTokensV1();

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error(`[${timestamp()}] V1 faucet request failed:`, result.effects?.status?.error);
      return false;
    }

    console.log(`[${timestamp()}] Received tokens from V1 faucet (1 NBTC + 100k NUSDC)`);
    await client.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting from V1 faucet:`, error);
    return false;
  }
}

async function executeRequestTokensV2(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  const tx = buildRequestTokensV2();

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error(`[${timestamp()}] V2 faucet request failed:`, result.effects?.status?.error);
      return false;
    }

    console.log(`[${timestamp()}] Received tokens from V2 faucet (0.1 NETH + 10 NSOL)`);
    await client.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting from V2 faucet:`, error);
    return false;
  }
}

async function executeRequestNusdc(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<boolean> {
  const tx = buildRequestNusdcOnly();

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

    console.log(`[${timestamp()}] Received 100k NUSDC from V1 faucet`);
    await client.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return true;
  } catch (error) {
    console.error(`[${timestamp()}] Error requesting NUSDC from faucet:`, error);
    return false;
  }
}
