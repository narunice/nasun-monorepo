/**
 * Pado MarginAccount Recovery Adapter (wallet-ui built-in)
 *
 * Discovers the user's MarginAccount (perp margin) and exposes withdraw-all
 * actions for NUSDC and NBTC.
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '@nasun/wallet';
import { MARGIN_PACKAGE_ID, MARGIN_REGISTRY_ID } from '@nasun/devnet-config';
import type { RecoveryAdapter, RecoverableItem, RecoveryAction } from '../types';
import type { SignAndExecuteFn } from '../../hooks/useSignAndExecute';

const NBTC_DECIMALS = 8;
const NUSDC_DECIMALS = 6;

function parseBalanceField(field: unknown): bigint {
  if (!field || typeof field !== 'object') return 0n;
  return BigInt(String((field as Record<string, unknown>).value ?? '0'));
}

async function findUserMarginAccount(address: string): Promise<string | null> {
  const client = getSuiClient();
  const objects = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: `${MARGIN_PACKAGE_ID}::unified_margin::MarginAccount` },
    options: { showContent: false },
  });
  return objects.data[0]?.data?.objectId ?? null;
}

async function getMarginAccount(id: string): Promise<{ nusdcBalance: bigint; nbtcBalance: bigint } | null> {
  const client = getSuiClient();
  const result = await client.getObject({ id, options: { showContent: true } });
  if (result.data?.content?.dataType !== 'moveObject') return null;
  const fields = result.data.content.fields as Record<string, unknown>;
  return {
    nusdcBalance: parseBalanceField(fields.nusdc_balance),
    nbtcBalance: parseBalanceField(fields.nbtc_balance),
  };
}

function buildWithdrawAllTx(accountId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MARGIN_PACKAGE_ID}::unified_margin::withdraw_all`,
    arguments: [tx.object(accountId), tx.object(MARGIN_REGISTRY_ID)],
  });
  return tx;
}

function buildWithdrawAllNbtcTx(accountId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MARGIN_PACKAGE_ID}::unified_margin::withdraw_all_nbtc`,
    arguments: [tx.object(accountId), tx.object(MARGIN_REGISTRY_ID)],
  });
  return tx;
}

export function createPadoMarginAdapter(signAndExecute: SignAndExecuteFn): RecoveryAdapter {
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
        actions.push({ label: 'No balance to recover', disabled: true, execute: async () => ({ digest: '' }) });
      }

      const item: RecoverableItem = {
        id: accountId,
        label: 'Perp MarginAccount',
        productName: 'Pado Perp Margin',
        balances: [
          { token: 'NUSDC', amount: account.nusdcBalance, decimals: NUSDC_DECIMALS },
          { token: 'NBTC', amount: account.nbtcBalance, decimals: NBTC_DECIMALS },
        ],
        actions,
      };
      return [item];
    },
  };
}
