/**
 * Pado BalanceManager Recovery Adapter
 *
 * Discovers user's primary BM and orphan BMs (from past recovery bugs)
 * and exposes a "Withdraw all" action that drains both NBTC + NUSDC
 * back to the user's wallet in a single PTB.
 */

import type { Transaction } from '@mysten/sui/transactions';
import type { RecoveryAdapter, RecoverableItem } from '@nasun/wallet-ui';
import { findUserBalanceManager } from '../trading/lib/balanceManagerValidation';
import { getBalanceManagerBalances } from '../../lib/deepbook';
import { buildWithdrawAll } from '../trading/transactions';
import { POOLS, TOKENS } from '../../config/network';

interface SignAndExecute {
  (tx: Transaction): Promise<{ digest: string }>;
}

export function createPadoBmAdapter(signAndExecute: SignAndExecute): RecoveryAdapter {
  return {
    productName: 'Pado Spot / Prediction (BalanceManager)',
    async discover(address) {
      const result = await findUserBalanceManager(address);
      const items: RecoverableItem[] = [];

      const buildItem = async (id: string, label: string): Promise<RecoverableItem> => {
        // Gracefully degrade on RPC failure — show disabled item rather than crashing recovery UI
        let balances = { base: 0, quote: 0 };
        try {
          balances = await getBalanceManagerBalances(id, POOLS.NBTC_NUSDC);
        } catch {
          // Balance unavailable; hasFunds will be false, item will be disabled
        }
        const nbtcRaw = BigInt(Math.round(balances.base * 10 ** TOKENS.NBTC.decimals));
        const nusdcRaw = BigInt(Math.round(balances.quote * 10 ** TOKENS.NUSDC.decimals));
        const hasFunds = nbtcRaw > 0n || nusdcRaw > 0n;
        return {
          id,
          label,
          productName: 'Pado Spot / Prediction',
          balances: [
            { token: 'NBTC', amount: nbtcRaw, decimals: TOKENS.NBTC.decimals },
            { token: 'NUSDC', amount: nusdcRaw, decimals: TOKENS.NUSDC.decimals },
          ],
          actions: [
            {
              label: 'Withdraw all to wallet',
              destructive: true,
              disabled: !hasFunds,
              disabledReason: hasFunds ? undefined : 'No balance to recover',
              execute: async () => {
                const tx = buildWithdrawAll(id, address, POOLS.NBTC_NUSDC);
                return signAndExecute(tx);
              },
            },
          ],
        };
      };

      const targets: Array<{ id: string; label: string }> = [];
      if (result.primaryId) {
        targets.push({ id: result.primaryId, label: 'Primary BalanceManager' });
      }
      result.orphans.forEach((o, i) => {
        targets.push({ id: o.id, label: `Orphan BalanceManager #${i + 1}` });
      });

      // Use allSettled so a single failed BM balance fetch doesn't blank the
      // whole panel — surface failed entries as disabled placeholders so the
      // user can see the BM exists and follow up via CLI if needed.
      const settled = await Promise.allSettled(targets.map((t) => buildItem(t.id, t.label)));
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          items.push(res.value);
        } else {
          const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
          items.push({
            id: targets[i].id,
            label: `${targets[i].label} (failed to load)`,
            productName: 'Pado Spot / Prediction',
            actions: [{
              label: 'Discovery failed',
              disabled: true,
              disabledReason: reason,
              execute: async () => ({ digest: '' }),
            }],
          });
        }
      });
      return items;
    },
  };
}
