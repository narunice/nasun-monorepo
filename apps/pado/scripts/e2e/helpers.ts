/**
 * E2E Test Helpers
 *
 * Shared utilities for SDK-level integration tests.
 * Admin keypair: loaded from ~/.sui/sui_config/sui.keystore (holds AdminCaps)
 * User keypair: loaded from .env.e2e.local (test-only wallet)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.e2e.local' });

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getKeypairFromSuiConfig } from '../lib/keystore';
import {
  NUSDC_TYPE,
  LOTTERY_REGISTRY,
  NUMBERMATCH_POOL,
  SCRATCHCARD_POOL,
} from '@nasun/devnet-config';

// ============================================================================
// Client
// ============================================================================

export const client = new SuiClient({ url: 'https://rpc.devnet.nasun.io' });

const CLOCK_ID = '0x6';
const SUI_RANDOM_ID = '0x8';
export { CLOCK_ID, SUI_RANDOM_ID };

// ============================================================================
// Keypairs (lazy-init to prevent crash on module load)
// ============================================================================

let _userKeypair: Ed25519Keypair;
let _adminKeypair: Ed25519Keypair;

export function getUserKeypair(): Ed25519Keypair {
  if (!_userKeypair) {
    const mnemonic = process.env.E2E_TEST_MNEMONIC;
    if (!mnemonic) {
      throw new Error(
        'E2E_TEST_MNEMONIC not set. Create .env.e2e.local with your test mnemonic.',
      );
    }
    _userKeypair = Ed25519Keypair.deriveKeypair(mnemonic);
  }
  return _userKeypair;
}

export function getUserAddress(): string {
  return getUserKeypair().getPublicKey().toSuiAddress();
}

export function getAdminKeypair(): Ed25519Keypair {
  if (!_adminKeypair) {
    _adminKeypair = getKeypairFromSuiConfig();
  }
  return _adminKeypair;
}

export function getAdminAddress(): string {
  return getAdminKeypair().getPublicKey().toSuiAddress();
}

// ============================================================================
// Transaction Execution
// ============================================================================

export async function execTx(tx: Transaction, signer: Ed25519Keypair) {
  return client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });
}

/**
 * Expect a transaction to fail (negative test).
 * Returns the error if TX fails, throws if TX succeeds.
 */
export async function expectTxFail(tx: Transaction, signer: Ed25519Keypair) {
  try {
    const result = await execTx(tx, signer);
    if (!result.effects?.status) {
      throw new Error('Missing TX effects');
    }
    const status = result.effects.status.status;
    if (status === 'success') {
      throw new Error('Expected TX to fail but it succeeded');
    }
    // On-chain failure (status === 'failure') is the expected path
    return result;
  } catch (err: unknown) {
    // RPC-level rejection is also acceptable for negative tests
    return err;
  }
}

// ============================================================================
// Balance Helpers
// ============================================================================

export async function getBalance(
  address: string,
  coinType: string,
): Promise<bigint> {
  const balance = await client.getBalance({ owner: address, coinType });
  return BigInt(balance.totalBalance);
}

export async function ensureBalance(
  address: string,
  coinType: string,
  min: bigint,
) {
  const balance = await getBalance(address, coinType);
  if (balance >= min) return;
  throw new Error(
    `Insufficient balance for ${address.slice(0, 10)}...: ` +
      `need ${min}, have ${balance}. Run faucet manually.`,
  );
}

/**
 * Find a NUSDC coin with sufficient balance for the given address.
 */
export async function findNusdcCoin(
  address: string,
  minBalance: bigint,
): Promise<string> {
  const coins = await client.getCoins({ owner: address, coinType: NUSDC_TYPE });

  for (const coin of coins.data) {
    if (BigInt(coin.balance) >= minBalance) {
      return coin.coinObjectId;
    }
  }

  const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
  throw new Error(
    `No single NUSDC coin >= ${minBalance} for ${address.slice(0, 10)}... ` +
      `(total across ${coins.data.length} coins: ${total})`,
  );
}

// ============================================================================
// Preflight Check
// ============================================================================

export async function preflightCheck() {
  const errors: string[] = [];

  // Check user balance
  const userAddr = getUserAddress();
  const nusdcBalance = await getBalance(userAddr, NUSDC_TYPE);
  if (nusdcBalance < 1000_000_000n) {
    errors.push(
      `User NUSDC balance too low: ${nusdcBalance} (need >= 1000 NUSDC). Run faucet.`,
    );
  }

  // Check NM pool
  try {
    const nmPool = await client.getObject({
      id: NUMBERMATCH_POOL,
      options: { showContent: true },
    });
    const nmFields = (nmPool.data?.content as any)?.fields;
    if (nmFields) {
      const poolBalance = BigInt(nmFields.pool || '0');
      if (poolBalance < 500_000_000n) {
        errors.push(
          `NumberMatch pool balance too low: ${poolBalance}. Run seed-leisure-pools.ts`,
        );
      }
    }
  } catch {
    errors.push('Failed to query NumberMatch pool');
  }

  // Check SC pool
  try {
    const scPool = await client.getObject({
      id: SCRATCHCARD_POOL,
      options: { showContent: true },
    });
    const scFields = (scPool.data?.content as any)?.fields;
    if (scFields) {
      const poolBalance = BigInt(scFields.pool || '0');
      if (poolBalance < 500_000_000n) {
        errors.push(
          `ScratchCard pool balance too low: ${poolBalance}. Run seed-leisure-pools.ts`,
        );
      }
    }
  } catch {
    errors.push('Failed to query ScratchCard pool');
  }

  // Check active lottery round
  try {
    const registry = await client.getObject({
      id: LOTTERY_REGISTRY,
      options: { showContent: true },
    });
    const regFields = (registry.data?.content as any)?.fields;
    if (!regFields || Number(regFields.current_round || 0) === 0) {
      errors.push(
        'No active lottery round. Run: CLOSE_DAYS=7 npx tsx seed-lottery.ts',
      );
    }
  } catch {
    errors.push('Failed to query Lottery registry');
  }

  if (errors.length > 0) {
    throw new Error(
      `Preflight check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}

// ============================================================================
// Utility
// ============================================================================

/** Wait for RPC indexing after a transaction */
export async function waitForTx(digest: string, timeoutMs = 10_000) {
  await client.waitForTransaction({ digest, timeout: timeoutMs });
}

/** Short delay */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
