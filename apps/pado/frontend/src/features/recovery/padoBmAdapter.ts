/**
 * Pado BalanceManager Recovery Adapter
 *
 * Discovers every BM the user owns and exposes a "Withdraw all" action that
 * drains their assets back to the user's wallet in a single PTB.
 *
 * Both the listing and the enabled state have to account for funds sitting
 * pool-side. DeepBook credits filled maker orders to `Account.settled_balances`
 * rather than the BM bag, so a manager can read as completely empty while
 * holding real money. Discovering by bag balance alone hid such managers
 * entirely (they are neither the highest-balance primary nor a funded orphan),
 * and gating the button on bag balance alone left the ones that did show up
 * disabled with "No balance to recover" on top of thousands of NUSDC.
 */

import type { Transaction } from '@mysten/sui/transactions';
import type { RecoveryAdapter, RecoverableItem } from '@nasun/wallet-ui';
import {
  findUserBalanceManager,
  findOwnedBalanceManagerIds,
} from '../trading/lib/balanceManagerValidation';
import { getBalanceManagerBalances } from '../../lib/deepbook';
import { buildWithdrawAll } from '../trading/transactions';
import { POOLS, TOKENS } from '../../config/network';
import { floatToRaw } from '../../lib/unified-margin';
import {
  getPendingProceeds,
  claimableProceeds,
  type PendingProceeds,
} from '../trading/lib/pendingProceeds';

// Recovery must drain every asset the user could have traded, not just the
// default pool's pair. withdraw_all on an absent coin type returns a zero coin,
// so listing every type is safe.
const ALL_TOKEN_TYPES = [
  ...new Set(
    Object.values(POOLS)
      .flatMap((p) => [p.baseToken.type, p.quoteToken.type])
      .filter((t): t is string => !!t)
  ),
];

interface SignAndExecute {
  (tx: Transaction): Promise<{ digest: string }>;
}

export function createPadoBmAdapter(signAndExecute: SignAndExecute): RecoveryAdapter {
  return {
    productName: 'Pado Spot / Prediction (BalanceManager)',
    async discover(address) {
      // Enumerate every owned manager, not just the ones the balance ranking
      // classifies. `findUserBalanceManager` runs alongside it only to label
      // which one the app trades through.
      const [ownedIds, result] = await Promise.all([
        findOwnedBalanceManagerIds(address),
        findUserBalanceManager(address),
      ]);
      const items: RecoverableItem[] = [];

      const buildItem = async (id: string, label: string): Promise<RecoverableItem> => {
        // Gracefully degrade on RPC failure — show disabled item rather than crashing recovery UI
        let balances = { base: 0, quote: 0 };
        try {
          balances = await getBalanceManagerBalances(id, POOLS.NBTC_NUSDC);
        } catch {
          // Balance unavailable; hasFunds falls back to the pool-side read
        }

        // Funds that already left the bag. Entries backing working orders are
        // included here because they are just as absent from the bag, even
        // though only the settled ones can be pulled back right now.
        let pending: PendingProceeds[] = [];
        try {
          pending = await getPendingProceeds(id);
        } catch {
          // Pool-side read unavailable; fall back to the bag balance alone
        }
        let pendingNbtc = 0n;
        let pendingNusdc = 0n;
        for (const p of pending) {
          if (p.pool.baseToken.symbol === 'NBTC') pendingNbtc += p.baseRaw;
          if (p.pool.quoteToken.symbol === 'NUSDC') pendingNusdc += p.quoteRaw;
        }

        const bagNbtcRaw = floatToRaw(balances.base, TOKENS.NBTC.decimals);
        const bagNusdcRaw = floatToRaw(balances.quote, TOKENS.NUSDC.decimals);
        const nbtcRaw = bagNbtcRaw + pendingNbtc;
        const nusdcRaw = bagNusdcRaw + pendingNusdc;

        // What the button can actually move right now. `pending` can hold assets
        // these two rows do not show (NETH, NSOL, NASUN), so a claimable entry
        // counts even when both displayed totals are zero. Collateral for
        // working orders is deliberately excluded: it shows in the totals above,
        // because it really has left the bag, but settling a pool with nothing
        // settled aborts, so an item with only that would send a transaction
        // that moves nothing and charges gas for it.
        const recoverable =
          bagNbtcRaw > 0n || bagNusdcRaw > 0n || claimableProceeds(pending).length > 0;
        const lockedOnly = !recoverable && pending.length > 0;
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
              disabled: !recoverable,
              disabledReason: recoverable
                ? undefined
                : lockedOnly
                  ? 'Funds are backing working orders. Cancel them to recover.'
                  : 'No balance to recover',
              execute: async () => {
                // Settling a pool with nothing settled aborts, so ask which
                // pools actually hold proceeds instead of settling blindly.
                const pending = claimableProceeds(await getPendingProceeds(id));
                const tx = buildWithdrawAll(id, address, POOLS.NBTC_NUSDC, {
                  settlePools: pending.map((p) => p.pool),
                  extraTokenTypes: ALL_TOKEN_TYPES,
                });
                return signAndExecute(tx);
              },
            },
          ],
        };
      };

      // Union so a manager missing from either source still gets listed:
      // discovery can outrun the ranking, and the ranking's primary is the only
      // entry guaranteed present when discovery degrades on an RPC failure.
      const seen = new Set<string>();
      const targets: Array<{ id: string; label: string }> = [];
      const pushTarget = (id: string, label: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        targets.push({ id, label });
      };

      if (result.primaryId) pushTarget(result.primaryId, 'Primary BalanceManager');
      let extra = 0;
      const pushExtra = (id: string) => {
        if (seen.has(id)) return;
        pushTarget(id, `Additional BalanceManager #${++extra}`);
      };
      // Orphans first: they are known to hold bag funds, so they matter most if
      // enumeration came back short.
      for (const o of result.orphans) pushExtra(o.id);
      for (const id of ownedIds) pushExtra(id);

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
