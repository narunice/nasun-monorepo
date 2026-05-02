/**
 * Pado Prediction Position Recovery Adapter
 *
 * Discovers user's prediction Position NFTs and exposes claim/burn/refund
 * actions based on the parent market's status.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { SuiObjectResponse } from '@mysten/sui/client';
import type { RecoveryAdapter, RecoverableItem, RecoveryAction } from '@nasun/wallet-ui';
import { getSuiClient } from '../../lib/sui-client';
import { POSITION_TYPE, NUSDC_DECIMALS } from '../prediction/constants';
import { fetchMarket } from '../prediction/lib/prediction-market';
import {
  buildClaimWinnings,
  buildBurnLosingPosition,
  buildClaimCancelledRefund,
} from '../prediction/transactions';

interface SignAndExecute {
  (tx: Transaction): Promise<{ digest: string }>;
}

interface ParsedPosition {
  id: string;
  marketId: string;
  isYes: boolean;
  shares: bigint;
  costBasis: bigint;
}

function parsePosition(obj: SuiObjectResponse): ParsedPosition | null {
  const data = obj.data;
  const content = data?.content;
  if (!content || !('fields' in content)) return null;
  const fields = content.fields as Record<string, unknown>;
  return {
    id: data?.objectId || '',
    marketId: String(fields.market_id ?? ''),
    isYes: Boolean(fields.is_yes ?? true),
    shares: BigInt(String(fields.shares ?? '0')),
    costBasis: BigInt(String(fields.cost_basis ?? '0')),
  };
}

export function createPadoPredictionPositionAdapter(
  signAndExecute: SignAndExecute,
): RecoveryAdapter {
  return {
    productName: 'Pado Prediction Positions',
    async discover(address) {
      const client = getSuiClient();
      // Paginate through all owned Position NFTs (50/page cap).
      const positions: ParsedPosition[] = [];
      let cursor: string | null | undefined;
      do {
        const page = await client.getOwnedObjects({
          owner: address,
          filter: { StructType: POSITION_TYPE },
          options: { showContent: true },
          cursor,
        });
        for (const obj of page.data) {
          const p = parsePosition(obj);
          if (p) positions.push(p);
        }
        cursor = page.nextCursor;
      } while (cursor);

      if (positions.length === 0) return [];

      // Fetch unique markets in parallel (de-dupe). allSettled so one failed
      // market fetch doesn't drop the whole position list — undefined falls
      // through to the "Market data unavailable" disabled action below.
      const uniqueMarketIds = Array.from(new Set(positions.map((p) => p.marketId)));
      const settled = await Promise.allSettled(uniqueMarketIds.map((id) => fetchMarket(id)));
      const marketById = new Map(
        uniqueMarketIds.map((id, i) => [id, settled[i].status === 'fulfilled' ? settled[i].value : null]),
      );

      const items: RecoverableItem[] = positions.map((pos) => {
        const market = marketById.get(pos.marketId);
        const side = pos.isYes ? 'YES' : 'NO';
        const sharesDisplay = (Number(pos.shares) / 10 ** NUSDC_DECIMALS).toFixed(2);
        const questionShort = market?.question
          ? market.question.slice(0, 60) + (market.question.length > 60 ? '...' : '')
          : 'Market unavailable';

        const actions: RecoveryAction[] = [];

        if (!market) {
          actions.push({
            label: 'Market data unavailable',
            disabled: true,
            disabledReason: 'Could not fetch market state',
            execute: async () => ({ digest: '' }),
          });
        } else if (market.status === 'resolved') {
          const isWinner = market.outcome !== undefined && market.outcome === pos.isYes;
          if (isWinner) {
            actions.push({
              label: 'Claim winnings',
              execute: async () => {
                const tx = new Transaction();
                buildClaimWinnings(tx, pos.marketId, pos.id);
                return signAndExecute(tx);
              },
            });
          } else {
            actions.push({
              label: 'Burn losing position',
              destructive: true,
              execute: async () => {
                const tx = new Transaction();
                buildBurnLosingPosition(tx, pos.marketId, pos.id);
                return signAndExecute(tx);
              },
            });
          }
        } else if (market.status === 'cancelled') {
          actions.push({
            label: 'Claim refund',
            execute: async () => {
              const tx = new Transaction();
              buildClaimCancelledRefund(tx, pos.marketId, pos.id);
              return signAndExecute(tx);
            },
          });
        } else {
          // open: cannot recover until resolved/cancelled (use trading UI to sell)
          actions.push({
            label: 'Sell on market',
            disabled: true,
            disabledReason: 'Market is open. Use the trading UI to place a sell order.',
            execute: async () => ({ digest: '' }),
          });
        }

        return {
          id: pos.id,
          label: `${side} ${sharesDisplay} shares — ${questionShort}`,
          productName: 'Pado Prediction',
          balances: [
            { token: `${side} shares`, amount: pos.shares, decimals: NUSDC_DECIMALS },
            { token: 'cost basis (NUSDC)', amount: pos.costBasis, decimals: NUSDC_DECIMALS },
          ],
          actions,
        };
      });

      return items;
    },
  };
}
