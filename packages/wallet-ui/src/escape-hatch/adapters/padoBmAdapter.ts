/**
 * Pado BalanceManager Recovery Adapter (wallet-ui built-in)
 *
 * Discovers the user's BalanceManager(s) on Pado and exposes a
 * "Withdraw all" action for both NBTC and NUSDC.
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '@nasun/wallet';
import {
  DEEPBOOK_PACKAGE_ID,
  NBTC_TYPE,
  NUSDC_TYPE,
  POOL_NBTC_NUSDC,
} from '@nasun/devnet-config';
import type { RecoveryAdapter, RecoverableItem } from '../types';
import type { SignAndExecuteFn } from '../../hooks/useSignAndExecute';

const NBTC_DECIMALS = 8;
const NUSDC_DECIMALS = 6;

function parseU64(bytes: number[]): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[i]) << BigInt(8 * i);
  }
  return value;
}

async function getBalanceManagerBalances(
  balanceManagerId: string,
): Promise<{ base: bigint; quote: bigint }> {
  const client = getSuiClient();
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::balance`,
    typeArguments: [NBTC_TYPE],
    arguments: [tx.object(balanceManagerId)],
  });
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::balance`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(balanceManagerId)],
  });

  const result = await client.devInspectTransactionBlock({
    sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    transactionBlock: tx,
  });

  const base =
    result.results?.[0]?.returnValues?.[0]?.[0]
      ? parseU64(result.results[0].returnValues[0][0])
      : 0n;
  const quote =
    result.results?.[1]?.returnValues?.[0]?.[0]
      ? parseU64(result.results[1].returnValues[0][0])
      : 0n;
  return { base, quote };
}

async function findUserBalanceManagers(address: string): Promise<string[]> {
  const client = getSuiClient();
  const eventType = `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManagerEvent`;
  const ids: string[] = [];
  const seen = new Set<string>();
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
  let hasMore = true;

  while (hasMore) {
    const page = await client.queryEvents({
      query: { Sender: address },
      cursor: cursor ?? undefined,
      limit: 50,
      order: 'ascending',
    });
    for (const ev of page.data) {
      if (ev.type !== eventType) continue;
      const json = ev.parsedJson as { balance_manager_id?: string; owner?: string } | undefined;
      if (!json?.balance_manager_id || json.owner !== address) continue;
      if (!seen.has(json.balance_manager_id)) {
        seen.add(json.balance_manager_id);
        ids.push(json.balance_manager_id);
      }
    }
    hasMore = page.hasNextPage;
    cursor = page.nextCursor ?? null;
  }
  return ids;
}

function buildWithdrawAll(bmId: string, recipient: string): Transaction {
  const tx = new Transaction();
  const base = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw_all`,
    typeArguments: [NBTC_TYPE],
    arguments: [tx.object(bmId)],
  });
  tx.transferObjects([base], tx.pure.address(recipient));
  const quote = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw_all`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(bmId)],
  });
  tx.transferObjects([quote], tx.pure.address(recipient));
  return tx;
}

export function createPadoBmAdapter(signAndExecute: SignAndExecuteFn, address: string | null): RecoveryAdapter {
  return {
    productName: 'Pado Spot / Prediction (BalanceManager)',
    async discover(userAddress) {
      const ids = await findUserBalanceManagers(userAddress);
      if (ids.length === 0) return [];

      const items: RecoverableItem[] = [];
      const results = await Promise.allSettled(
        ids.map(async (id, i): Promise<RecoverableItem> => {
          const label = i === 0 ? 'Primary BalanceManager' : `BalanceManager #${i + 1}`;
          try {
            const { base, quote } = await getBalanceManagerBalances(id);
            const hasFunds = base > 0n || quote > 0n;
            return {
              id,
              label,
              productName: 'Pado Spot / Prediction',
              balances: [
                { token: 'NBTC', amount: base, decimals: NBTC_DECIMALS },
                { token: 'NUSDC', amount: quote, decimals: NUSDC_DECIMALS },
              ],
              actions: [{
                label: 'Withdraw all to wallet',
                destructive: true,
                disabled: !hasFunds,
                disabledReason: hasFunds ? undefined : 'No balance to recover',
                execute: async () => signAndExecute(buildWithdrawAll(id, address ?? userAddress)),
              }],
            };
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            return {
              id,
              label: `${label} (failed to load)`,
              productName: 'Pado Spot / Prediction',
              actions: [{ label: 'Discovery failed', disabled: true, disabledReason: reason, execute: async () => ({ digest: '' }) }],
            };
          }
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') items.push(r.value);
      }
      return items;
    },
  };
}

// Suppress unused-import warnings: POOL_NBTC_NUSDC is referenced in pool context
void POOL_NBTC_NUSDC;
