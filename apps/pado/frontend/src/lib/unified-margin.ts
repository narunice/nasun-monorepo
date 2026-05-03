/**
 * Unified Margin Client
 *
 * On-chain interaction for Unified Margin contract
 * Package: 0x2886424ff9b3ed9ecdb408ea1f68ca9598efbcbf796311ad3dc33c97d31d63c7
 *
 * @version 0.5.0 (Multi-Collateral Support)
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '@nasun/wallet';
import { NETWORK_CONFIG } from '../config/network';

// Contract addresses (V7 deployed, env-configured)
export const UNIFIED_MARGIN_PACKAGE =
  import.meta.env.VITE_MARGIN_PACKAGE_ID || '';
export const MARGIN_REGISTRY_ID =
  import.meta.env.VITE_MARGIN_REGISTRY_ID || '';
const CLOCK_ID = '0x6';

// Token types (from env config)
const TOKENS_PACKAGE = import.meta.env.VITE_TOKENS_PACKAGE || '';
export const NUSDC_TYPE = import.meta.env.VITE_NUSDC_TYPE || `${TOKENS_PACKAGE}::nusdc::NUSDC`;
export const NBTC_TYPE = import.meta.env.VITE_NBTC_TYPE || `${TOKENS_PACKAGE}::nbtc::NBTC`;

// Supported collateral tokens
export type CollateralToken = 'NUSDC' | 'NBTC';

// Types
export interface MarginAccountData {
  id: string;
  owner: string;
  nusdcBalance: bigint;
  nbtcBalance: bigint; // v0.5: Multi-collateral
  totalDepositedUsd: bigint;
  totalWithdrawnUsd: bigint;
  createdAt: number;
}

// Backward compatible alias
export interface MarginAccountDataLegacy {
  id: string;
  owner: string;
  nusdcBalance: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  createdAt: number;
}

export interface MarginRegistryData {
  totalAccounts: number;
  totalTvl: bigint;
}

// Storage key prefix for MarginAccount ID (per-wallet)
const MARGIN_ACCOUNT_KEY_PREFIX = 'pado_margin_account_';

// Storage key prefix for BalanceManager ID (per-wallet)
// IMPORTANT: This must be address-keyed to support multi-wallet environments
const BALANCE_MANAGER_KEY_PREFIX = 'pado_balance_manager_';

/**
 * Get storage key for a specific wallet address
 */
function getMarginAccountKey(walletAddress: string): string {
  return `${MARGIN_ACCOUNT_KEY_PREFIX}${walletAddress}`;
}

/**
 * Get stored MarginAccount ID from localStorage for a specific wallet
 */
export function getStoredMarginAccountId(walletAddress: string): string | null {
  try {
    return localStorage.getItem(getMarginAccountKey(walletAddress));
  } catch {
    return null;
  }
}

/**
 * Store MarginAccount ID in localStorage for a specific wallet
 */
export function storeMarginAccountId(walletAddress: string, id: string): void {
  try {
    localStorage.setItem(getMarginAccountKey(walletAddress), id);
  } catch {
    console.error('Failed to store margin account ID');
  }
}

/**
 * Clear stored MarginAccount ID for a specific wallet
 */
export function clearMarginAccountId(walletAddress: string): void {
  try {
    localStorage.removeItem(getMarginAccountKey(walletAddress));
  } catch {
    console.error('Failed to clear margin account ID');
  }
}

// ===== BalanceManager Storage Functions =====

/**
 * Get storage key for BalanceManager for a specific wallet address
 */
function getBalanceManagerKey(walletAddress: string): string {
  return `${BALANCE_MANAGER_KEY_PREFIX}${walletAddress}`;
}

/**
 * Get stored BalanceManager ID from localStorage for a specific wallet
 * NOTE: Migration from legacy global key was removed due to cross-contamination bug
 * (would copy another user's BM ID to current user without ownership verification)
 */
export function getStoredBalanceManagerId(walletAddress: string): string | null {
  if (!walletAddress) return null;

  try {
    // Only use address-keyed storage (no migration - prevents cross-user contamination)
    return localStorage.getItem(getBalanceManagerKey(walletAddress));
  } catch {
    return null;
  }
}

/**
 * Store BalanceManager ID in localStorage for a specific wallet
 * NOTE: Legacy key storage was removed to prevent cross-user contamination
 */
export function storeBalanceManagerId(walletAddress: string, id: string): void {
  if (!walletAddress) return;

  try {
    localStorage.setItem(getBalanceManagerKey(walletAddress), id);
  } catch {
    console.error('Failed to store balance manager ID');
  }
}

/**
 * Clear stored BalanceManager ID for a specific wallet
 */
export function clearBalanceManagerId(walletAddress: string): void {
  if (!walletAddress) return;

  try {
    localStorage.removeItem(getBalanceManagerKey(walletAddress));
  } catch {
    console.error('Failed to clear balance manager ID');
  }
}

/**
 * Parse Balance field from Move object (nested structure: { fields: { value: string } })
 */
function parseBalanceField(field: unknown): bigint {
  if (field && typeof field === 'object') {
    const balanceFields = (field as { fields?: { value?: string } }).fields;
    if (balanceFields?.value) {
      return BigInt(balanceFields.value);
    }
  }
  return 0n;
}

/**
 * Fetch MarginAccount data from chain
 * Supports both v0 (NUSDC only) and v0.5 (Multi-collateral) accounts
 */
export async function getMarginAccount(
  accountId: string
): Promise<MarginAccountData | null> {
  const client = getSuiClient();

  try {
    const result = await client.getObject({
      id: accountId,
      options: { showContent: true },
    });

    if (!result.data?.content || result.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = result.data.content.fields as Record<string, unknown>;
    if (!fields) return null;

    // Parse NUSDC balance
    const nusdcBalance = parseBalanceField(fields.nusdc_balance);

    // Parse NBTC balance (v0.5, optional for backward compatibility)
    const nbtcBalance = parseBalanceField(fields.nbtc_balance);

    // Safe access for u64 fields (support both v0 and v0.5 field names)
    const totalDepositedUsd = fields.total_deposited_usd ?? fields.total_deposited;
    const totalWithdrawnUsd = fields.total_withdrawn_usd ?? fields.total_withdrawn;
    const createdAt = fields.created_at;

    return {
      id: accountId,
      owner: String(fields.owner || ''),
      nusdcBalance,
      nbtcBalance,
      totalDepositedUsd: BigInt(String(totalDepositedUsd || '0')),
      totalWithdrawnUsd: BigInt(String(totalWithdrawnUsd || '0')),
      createdAt: Number(createdAt || 0),
    };
  } catch (error) {
    console.error('Failed to fetch margin account:', error);
    return null;
  }
}

/**
 * Fetch MarginRegistry stats
 */
export async function getMarginRegistryStats(): Promise<MarginRegistryData | null> {
  const client = getSuiClient();

  try {
    const result = await client.getObject({
      id: MARGIN_REGISTRY_ID,
      options: { showContent: true },
    });

    if (!result.data?.content || result.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = result.data.content.fields as Record<string, unknown>;

    return {
      totalAccounts: Number(fields.total_accounts),
      totalTvl: BigInt(fields.total_tvl as string),
    };
  } catch (error) {
    console.error('Failed to fetch margin registry:', error);
    return null;
  }
}

/**
 * Find user's MarginAccount by querying owned objects
 */
export async function findUserMarginAccount(
  userAddress: string
): Promise<string | null> {
  const client = getSuiClient();

  try {
    const objects = await client.getOwnedObjects({
      owner: userAddress,
      filter: {
        StructType: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::MarginAccount`,
      },
      options: { showContent: true },
    });

    if (objects.data.length > 0 && objects.data[0].data) {
      return objects.data[0].data.objectId;
    }

    return null;
  } catch (error) {
    console.error('Failed to find margin account:', error);
    return null;
  }
}

// ===== Transaction Builders =====

/**
 * Build create_account transaction
 */
export function buildCreateAccountTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::create_account`,
    arguments: [tx.object(MARGIN_REGISTRY_ID), tx.object(CLOCK_ID)],
  });

  return tx;
}

/**
 * Build a single PTB that creates BalanceManager + MarginAccount atomically.
 * Either both succeed or both fail — eliminates partial-state UX where the
 * user ends up with one but not the other.
 */
export function buildEnablePadoTx(): Transaction {
  const tx = new Transaction();

  // 1. BalanceManager: create + share
  const [balanceManager] = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::new`,
    arguments: [],
  });
  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    typeArguments: [`${NETWORK_CONFIG.deepbookPackage}::balance_manager::BalanceManager`],
    arguments: [balanceManager],
  });

  // 2. MarginAccount: create_account internally transfers to sender
  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::create_account`,
    arguments: [tx.object(MARGIN_REGISTRY_ID), tx.object(CLOCK_ID)],
  });

  return tx;
}

/**
 * Build deposit transaction
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param nusdcCoinId - NUSDC coin object ID to deposit
 */
export function buildDepositTx(
  marginAccountId: string,
  nusdcCoinId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::deposit`,
    arguments: [
      tx.object(marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      tx.object(nusdcCoinId),
    ],
  });

  return tx;
}

/**
 * Build deposit transaction with split (for partial deposit)
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param nusdcCoinId - NUSDC coin object ID to split from
 * @param amount - Amount to deposit (in smallest unit, 6 decimals)
 */
export function buildDepositWithSplitTx(
  marginAccountId: string,
  nusdcCoinId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  // Split the exact amount
  const [depositCoin] = tx.splitCoins(tx.object(nusdcCoinId), [amount]);

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::deposit`,
    arguments: [
      tx.object(marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      depositCoin,
    ],
  });

  return tx;
}

/**
 * Build withdraw transaction
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param amount - Amount to withdraw (in smallest unit, 6 decimals)
 */
export function buildWithdrawTx(
  marginAccountId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::withdraw`,
    arguments: [
      tx.object(marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/**
 * Build withdraw_all transaction (NUSDC)
 *
 * @param marginAccountId - User's MarginAccount object ID
 */
export function buildWithdrawAllTx(marginAccountId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::withdraw_all`,
    arguments: [tx.object(marginAccountId), tx.object(MARGIN_REGISTRY_ID)],
  });

  return tx;
}

// ===== NBTC Transaction Builders (v0.5) =====

/**
 * Build deposit_nbtc transaction
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param nbtcCoinId - NBTC coin object ID to deposit
 */
export function buildDepositNbtcTx(
  marginAccountId: string,
  nbtcCoinId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::deposit_nbtc`,
    arguments: [
      tx.object(marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      tx.object(nbtcCoinId),
    ],
  });

  return tx;
}

/**
 * Build deposit_nbtc transaction with split (for partial deposit)
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param nbtcCoinId - NBTC coin object ID to split from
 * @param amount - Amount to deposit (in smallest unit, 8 decimals)
 */
export function buildDepositNbtcWithSplitTx(
  marginAccountId: string,
  nbtcCoinId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  // Split the exact amount
  const [depositCoin] = tx.splitCoins(tx.object(nbtcCoinId), [amount]);

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::deposit_nbtc`,
    arguments: [
      tx.object(marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      depositCoin,
    ],
  });

  return tx;
}

/**
 * Build withdraw_nbtc transaction
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param amount - Amount to withdraw (in smallest unit, 8 decimals)
 */
export function buildWithdrawNbtcTx(
  marginAccountId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::withdraw_nbtc`,
    arguments: [
      tx.object(marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/**
 * Build withdraw_all_nbtc transaction
 *
 * @param marginAccountId - User's MarginAccount object ID
 */
export function buildWithdrawAllNbtcTx(marginAccountId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::withdraw_all_nbtc`,
    arguments: [tx.object(marginAccountId), tx.object(MARGIN_REGISTRY_ID)],
  });

  return tx;
}
