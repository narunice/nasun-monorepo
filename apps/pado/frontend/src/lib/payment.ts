/**
 * Unified payment assembly for prediction market trades.
 *
 * MA-first routing: when a MarginAccount has sufficient NUSDC, withdraw
 * inline (PTB composable, atomic). Falls back to BM, then wallet coins.
 *
 * withdraw_nusdc_as_coin and BM.withdraw both return Coin<T> (not void),
 * making them chainable in a PTB.
 */

import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { NETWORK_CONFIG } from '../config/network';
import { getSuiClient } from './sui-client';
import { NUSDC_TYPE } from '../features/prediction/constants';
import { UNIFIED_MARGIN_PACKAGE, MARGIN_REGISTRY_ID } from './unified-margin';

/**
 * Append a MA NUSDC withdraw call to an existing PTB.
 * Returns Coin<NUSDC> for chaining into downstream calls (e.g. prediction buy).
 */
export function withdrawNusdcFromMa(
  tx: Transaction,
  maId: string,
  amount: bigint,
): TransactionArgument {
  return tx.moveCall({
    target: `${UNIFIED_MARGIN_PACKAGE}::unified_margin::withdraw_nusdc_as_coin`,
    arguments: [tx.object(maId), tx.object(MARGIN_REGISTRY_ID), tx.pure.u64(amount)],
  });
}

/**
 * Append a BM NUSDC withdraw call to an existing PTB.
 * Returns the Coin<NUSDC> TransactionArgument for chaining into predict calls.
 */
export function withdrawNusdcFromBm(
  tx: Transaction,
  bmId: string,
  amount: bigint,
): TransactionArgument {
  return tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::withdraw`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(bmId), tx.pure.u64(amount)],
  });
}

/**
 * Query NUSDC balance in a BalanceManager via read-only devInspect.
 * Exported for use by recovery adapters and portfolio aggregation.
 */
export async function getBmNusdcBalance(bmId: string): Promise<bigint> {
  const client = getSuiClient();
  const tx = new Transaction();
  tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::balance`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(bmId)],
  });
  try {
    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });
    const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
    if (!bytes) return 0n;
    // little-endian u64
    let value = 0n;
    for (let i = 0; i < 8 && i < bytes.length; i++) {
      value += BigInt(bytes[i]) << BigInt(i * 8);
    }
    return value;
  } catch {
    return 0n;
  }
}

/**
 * Assemble wallet-coin payment: merges fragmented NUSDC, splits exact amount.
 */
export async function assembleWalletPaymentArg(
  tx: Transaction,
  amount: bigint,
  walletAddress: string,
  client: SuiClient,
): Promise<TransactionArgument> {
  if (amount === 0n) throw new Error('Amount must be positive');

  // Paginate to collect all NUSDC objects (getCoins returns at most 50 per page).
  const allCoins: Array<{ coinObjectId: string; balance: string }> = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page = await client.getCoins({ owner: walletAddress, coinType: NUSDC_TYPE, cursor });
    allCoins.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);

  const total = allCoins.reduce((s, c) => s + BigInt(c.balance), 0n);
  if (total < amount) throw new Error('Insufficient NUSDC');

  const sufficient = allCoins.find((c) => BigInt(c.balance) >= amount);
  if (sufficient) {
    return tx.splitCoins(tx.object(sufficient.coinObjectId), [tx.pure.u64(amount)])[0];
  }

  const [primary, ...rest] = allCoins;
  if (rest.length > 0) {
    tx.mergeCoins(
      tx.object(primary.coinObjectId),
      rest.map((c) => tx.object(c.coinObjectId)),
    );
  }
  return tx.splitCoins(tx.object(primary.coinObjectId), [tx.pure.u64(amount)])[0];
}

export type UnifiedPaymentOptions = {
  /** DeepBook BalanceManager ID — falls back to wallet if null */
  bmId: string | null;
  /** MarginAccount object ID — checked first (cached balance, no extra RPC) */
  maId: string | null;
  /** Cached MA NUSDC balance (useMarginAccount().account?.nusdcBalance ?? 0n) */
  maBalance: bigint;
  client: SuiClient;
};

/**
 * MA-first payment dispatcher.
 *
 * Routing priority: MA (cached balance, no RPC) → BM (devInspect RPC) → wallet.
 * When MA has sufficient balance the whole flow is one atomic PTB.
 *
 * Returns the payment arg and the source for UX/debugging.
 */
export async function assembleUnifiedPaymentArg(
  tx: Transaction,
  amount: bigint,
  walletAddress: string,
  options: UnifiedPaymentOptions,
): Promise<{ paymentArg: TransactionArgument; source: 'ma' | 'bm' | 'wallet' }> {
  const { bmId, maId, maBalance, client } = options;
  if (maId && maBalance >= amount) {
    return { paymentArg: withdrawNusdcFromMa(tx, maId, amount), source: 'ma' };
  }
  if (bmId) {
    const bmBalance = await getBmNusdcBalance(bmId);
    if (bmBalance >= amount) {
      return { paymentArg: withdrawNusdcFromBm(tx, bmId, amount), source: 'bm' };
    }
  }
  const paymentArg = await assembleWalletPaymentArg(tx, amount, walletAddress, client);
  return { paymentArg, source: 'wallet' };
}
