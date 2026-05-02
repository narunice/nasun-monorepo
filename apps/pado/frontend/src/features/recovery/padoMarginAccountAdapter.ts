/**
 * Pado MarginAccount Recovery Adapter
 *
 * Discovers user's MarginAccount (perp margin) and exposes withdraw-all
 * actions for NUSDC and NBTC.
 */

import type { Transaction } from '@mysten/sui/transactions';
import type { RecoveryAdapter, RecoverableItem, RecoveryAction } from '@nasun/wallet-ui';
import {
  findUserMarginAccount,
  getMarginAccount,
  buildWithdrawAllTx,
  buildWithdrawAllNbtcTx,
} from '../../lib/unified-margin';
import { TOKENS } from '../../config/network';

interface SignAndExecute {
  (tx: Transaction): Promise<{ digest: string }>;
}

export function createPadoMarginAccountAdapter(signAndExecute: SignAndExecute): RecoveryAdapter {
  return {
    productName: 'Pado Perp Margin (MarginAccount)',
    async discover(address) {
      const accountId = await findUserMarginAccount(address);
      if (!accountId) return [];
      const account = await getMarginAccount(accountId);
      if (!account) return [];

      const actions: RecoveryAction[] = [];
      if (account.nusdcBalance > 0n) {
        actions.push({
          label: 'Withdraw all NUSDC to wallet',
          destructive: true,
          execute: async () => signAndExecute(buildWithdrawAllTx(accountId)),
        });
      }
      if (account.nbtcBalance > 0n) {
        actions.push({
          label: 'Withdraw all NBTC to wallet',
          destructive: true,
          execute: async () => signAndExecute(buildWithdrawAllNbtcTx(accountId)),
        });
      }
      if (actions.length === 0) {
        actions.push({
          label: 'No balance to recover',
          disabled: true,
          execute: async () => ({ digest: '' }),
        });
      }

      const item: RecoverableItem = {
        id: accountId,
        label: 'Perp MarginAccount',
        productName: 'Pado Perp Margin',
        balances: [
          { token: 'NUSDC', amount: account.nusdcBalance, decimals: TOKENS.NUSDC.decimals },
          { token: 'NBTC', amount: account.nbtcBalance, decimals: TOKENS.NBTC.decimals },
        ],
        actions,
      };
      return [item];
    },
  };
}
