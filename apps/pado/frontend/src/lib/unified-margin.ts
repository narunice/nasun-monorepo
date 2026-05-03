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
import { appendSwapBaseForQuote } from './deepbook';
import type { PoolConfig } from '../features/trading/types';

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

/**
 * Convert a float to a raw bigint without IEEE-754 round-trip errors.
 * Uses string-based parsing via toFixed to avoid cases like 0.1 * 1e6 = 99999.99999...
 */
export function floatToRaw(value: number, decimals: number): bigint {
  if (!isFinite(value) || value < 0) return 0n;
  const [int, frac = ''] = value.toFixed(decimals).split('.');
  return BigInt(int + frac.padEnd(decimals, '0').slice(0, decimals));
}

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
 * Parse a Move `Balance<T>` field from a getObject({showContent:true}) response.
 *
 * Sui RPC has shipped this in several shapes for the same single-field struct:
 *   1. plain string:     "453000000"
 *   2. plain number:     453000000
 *   3. flat object:      { value: "453000000" }
 *   4. typed wrapper:    { type: "0x2::balance::Balance<...>", fields: { value: "453000000" } }
 *
 * Older code only handled (4); upgrades of the margin package surfaced (1) on devnet
 * and silently zeroed user balances (deposits visible only via total_deposited_usd).
 * Handle all four.
 */
function parseBalanceField(field: unknown): bigint {
  if (field == null) return 0n;
  if (typeof field === 'string' || typeof field === 'number' || typeof field === 'bigint') {
    try { return BigInt(field); } catch { return 0n; }
  }
  if (typeof field === 'object') {
    const obj = field as { value?: unknown; fields?: { value?: unknown } };
    if (obj.fields && obj.fields.value != null) {
      try { return BigInt(obj.fields.value as string | number); } catch { return 0n; }
    }
    if (obj.value != null) {
      try { return BigInt(obj.value as string | number); } catch { return 0n; }
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
 * Build deposit transaction with split (for partial deposit).
 *
 * If `extraCoinIds` is non-empty, those coins are merged into the primary
 * coin first so the split has enough balance. Required when no single NUSDC
 * coin object holds the requested amount (common after many small faucet
 * claims or auto-deposit fragmentation).
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param nusdcCoinId - Primary NUSDC coin object ID to split from
 * @param amount - Amount to deposit (in smallest unit, 6 decimals)
 * @param extraCoinIds - Additional NUSDC coin object IDs to merge into the primary
 */
export function buildDepositWithSplitTx(
  marginAccountId: string,
  nusdcCoinId: string,
  amount: bigint,
  extraCoinIds: string[] = []
): Transaction {
  const tx = new Transaction();

  if (extraCoinIds.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinIds.map((id) => tx.object(id))
    );
  }

  // Split the exact amount from the (possibly merged) primary coin
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
 * Build deposit_nbtc transaction with split (for partial deposit).
 *
 * NBTC is native multi-collateral (5% haircut) — deposits go directly into
 * `MarginAccount.nbtc_balance`, never swapped to NUSDC.
 *
 * If `extraCoinIds` is non-empty, those coins are merged into the primary
 * coin first so the split has enough balance.
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param nbtcCoinId - Primary NBTC coin object ID to split from
 * @param amount - Amount to deposit (raw, 8 decimals)
 * @param extraCoinIds - Additional NBTC coin object IDs to merge into the primary
 */
export function buildDepositNbtcWithSplitTx(
  marginAccountId: string,
  nbtcCoinId: string,
  amount: bigint,
  extraCoinIds: string[] = []
): Transaction {
  const tx = new Transaction();

  if (extraCoinIds.length > 0) {
    tx.mergeCoins(
      tx.object(nbtcCoinId),
      extraCoinIds.map((id) => tx.object(id))
    );
  }

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
 * Atomic "swap any base token → NUSDC → deposit to MA" PTB.
 *
 * Used for tokens that aren't accepted as native collateral (NETH, NSOL, NSN).
 * The swap step enforces `minQuoteOut`; if the book moves unfavorably the
 * entire transaction reverts and no state changes — base coins stay merged
 * but unsplit (no harm done).
 *
 * Pre-flight verified that Pado pools are whitelisted (DEEP fee = 0), so we
 * pass a `coin::zero<DEEP>` as the DeepBook fee coin.
 *
 * @param marginAccountId - User's MarginAccount object ID
 * @param pool - DeepBook pool (base/NUSDC). Asserted at runtime that quote = NUSDC
 * @param baseCoinId - Primary base-token coin object ID
 * @param baseAmount - Amount of base token to swap (raw, in base decimals)
 * @param minQuoteOut - Minimum NUSDC out enforced by DeepBook (raw, 6 decimals)
 * @param sender - Wallet address receiving base/deep dust
 * @param extraBaseCoinIds - Additional base-token coins to merge into primary
 */
export function buildSwapAndDepositTx(args: {
  marginAccountId: string;
  pool: PoolConfig;
  baseCoinId: string;
  baseAmount: bigint;
  minQuoteOut: bigint;
  sender: string;
  extraBaseCoinIds?: string[];
}): Transaction {
  if (args.pool.quoteToken.type !== NUSDC_TYPE) {
    throw new Error(
      `Pool quote token is not NUSDC (got ${args.pool.quoteToken.type}); cannot route to unified_margin::deposit`
    );
  }
  if (!NETWORK_CONFIG.deepType) {
    throw new Error('VITE_DEEP_TOKEN env var missing — cannot construct DEEP coin argument');
  }

  const tx = new Transaction();

  // 1. (optional) merge fragmented base coins into the primary
  if (args.extraBaseCoinIds && args.extraBaseCoinIds.length > 0) {
    tx.mergeCoins(
      tx.object(args.baseCoinId),
      args.extraBaseCoinIds.map((id) => tx.object(id))
    );
  }

  // 2. split the exact base amount to send into the swap
  const [baseInput] = tx.splitCoins(tx.object(args.baseCoinId), [args.baseAmount]);

  // 3. zero-DEEP fee coin (pool whitelisted — see probe-deep-fee.ts)
  const [deepZero] = tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: [NETWORK_CONFIG.deepType],
  });

  // 4. swap base → NUSDC, with minQuoteOut as slippage floor
  const [baseOut, quoteOut, deepOut] = appendSwapBaseForQuote(
    tx,
    args.pool,
    baseInput,
    deepZero,
    args.minQuoteOut
  );

  // 5. dust back to sender (base remainder + deep)
  tx.transferObjects([baseOut, deepOut], tx.pure.address(args.sender));

  // 6. deposit the NUSDC output into MarginAccount
  tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::deposit`,
    arguments: [
      tx.object(args.marginAccountId),
      tx.object(MARGIN_REGISTRY_ID),
      quoteOut,
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
 * Drain all NUSDC/NBTC from both BalanceManager and MarginAccount in one PTB.
 * MA side uses unified_margin::withdraw_all (transfers to sender internally).
 * BM side uses balance_manager::withdraw_all to atomically drain each token,
 * eliminating the TOCTOU race that occurred with the explicit-amount withdraw.
 */
export function buildWithdrawAllPadoTx(
  marginAccountId: string | null,
  balanceManagerId: string | null,
  recipientAddress: string,
): Transaction {
  const { deepbookPackage } = NETWORK_CONFIG;
  const tx = new Transaction();

  if (marginAccountId) {
    tx.moveCall({
      target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::withdraw_all`,
      arguments: [tx.object(marginAccountId), tx.object(MARGIN_REGISTRY_ID)],
    });
  }

  if (balanceManagerId) {
    // withdraw_all returns a zero-value Coin<T> when balance is 0 — safe to transfer.
    const nusdcCoin = tx.moveCall({
      target: `${deepbookPackage}::balance_manager::withdraw_all`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(balanceManagerId)],
    });
    tx.transferObjects([nusdcCoin], tx.pure.address(recipientAddress));

    const nbtcCoin = tx.moveCall({
      target: `${deepbookPackage}::balance_manager::withdraw_all`,
      typeArguments: [NBTC_TYPE],
      arguments: [tx.object(balanceManagerId)],
    });
    tx.transferObjects([nbtcCoin], tx.pure.address(recipientAddress));
  }

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
