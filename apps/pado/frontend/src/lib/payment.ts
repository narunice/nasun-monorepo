/**
 * Unified payment assembly for prediction market trades.
 *
 * BM-first routing: when a BalanceManager has sufficient NUSDC, withdraw
 * inline (PTB composable). Falls back to wallet coins.
 *
 * BM.withdraw returns Coin<T> (not void), making it chainable in a PTB.
 * Confirmed in trading/transactions.ts:209 and deepbookv3 balance_manager.move.
 */

import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { NETWORK_CONFIG } from '../config/network';
import { getSuiClient } from './sui-client';
import { NUSDC_TYPE } from '../features/prediction/constants';

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

/**
 * BM-first payment dispatcher.
 *
 * When bmId is provided and the BM holds sufficient NUSDC: withdraw inline.
 * Otherwise: fall back to wallet coin assembly.
 *
 * Returns the payment arg and the source ('bm' | 'wallet') for UX signaling.
 */
export async function assembleUnifiedPaymentArg(
  tx: Transaction,
  amount: bigint,
  walletAddress: string,
  bmId: string | null,
  client: SuiClient,
): Promise<{ paymentArg: TransactionArgument; source: 'bm' | 'wallet' }> {
  if (bmId) {
    const bmBalance = await getBmNusdcBalance(bmId);
    if (bmBalance >= amount) {
      return { paymentArg: withdrawNusdcFromBm(tx, bmId, amount), source: 'bm' };
    }
  }
  const paymentArg = await assembleWalletPaymentArg(tx, amount, walletAddress, client);
  return { paymentArg, source: 'wallet' };
}
