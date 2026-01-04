/**
 * Unified Margin Client
 *
 * On-chain interaction for Unified Margin contract
 * Package: 0x2886424ff9b3ed9ecdb408ea1f68ca9598efbcbf796311ad3dc33c97d31d63c7
 *
 * @version 0.1.0
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '@nasun/wallet';

// Contract addresses
export const UNIFIED_MARGIN_PACKAGE =
  '0x2886424ff9b3ed9ecdb408ea1f68ca9598efbcbf796311ad3dc33c97d31d63c7';
export const MARGIN_REGISTRY_ID =
  '0x57979cb0f06a61c65f0f26a41cb3c53461e4c5638bed6740797a80bbb8fe3914';
const CLOCK_ID = '0x6';

// Types
export interface MarginAccountData {
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

// Storage key for MarginAccount ID
const MARGIN_ACCOUNT_KEY = 'pado_margin_account';

/**
 * Get stored MarginAccount ID from localStorage
 */
export function getStoredMarginAccountId(): string | null {
  try {
    return localStorage.getItem(MARGIN_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

/**
 * Store MarginAccount ID in localStorage
 */
export function storeMarginAccountId(id: string): void {
  try {
    localStorage.setItem(MARGIN_ACCOUNT_KEY, id);
  } catch {
    console.error('Failed to store margin account ID');
  }
}

/**
 * Clear stored MarginAccount ID
 */
export function clearMarginAccountId(): void {
  try {
    localStorage.removeItem(MARGIN_ACCOUNT_KEY);
  } catch {
    console.error('Failed to clear margin account ID');
  }
}

/**
 * Fetch MarginAccount data from chain
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

    return {
      id: accountId,
      owner: fields.owner as string,
      nusdcBalance: BigInt((fields.nusdc_balance as { fields: { value: string } }).fields.value),
      totalDeposited: BigInt(fields.total_deposited as string),
      totalWithdrawn: BigInt(fields.total_withdrawn as string),
      createdAt: Number(fields.created_at),
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
 * Build withdraw_all transaction
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
