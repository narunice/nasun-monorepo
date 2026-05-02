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
        const balances = await getBalanceManagerBalances(id, POOLS.NBTC_NUSDC);
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

      if (result.primaryId) {
        items.push(await buildItem(result.primaryId, 'Primary BalanceManager'));
      }
      for (let i = 0; i < result.orphans.length; i++) {
        items.push(await buildItem(result.orphans[i].id, `Orphan BalanceManager #${i + 1}`));
      }
      return items;
    },
  };
}
