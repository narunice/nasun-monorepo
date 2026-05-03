/**
 * Pado Prediction Position Recovery Adapter (wallet-ui built-in)
 *
 * Discovers user's prediction Position NFTs and exposes claim/burn/refund
 * actions based on the parent market's status.
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '@nasun/wallet';
import { PREDICTION_PACKAGE_ID } from '@nasun/devnet-config';
import type { SuiObjectResponse } from '@mysten/sui/client';
import type { RecoveryAdapter, RecoverableItem, RecoveryAction } from '../types';
import type { SignAndExecuteFn } from '../../hooks/useSignAndExecute';

const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
const NUSDC_DECIMALS = 6;

interface ParsedPosition {
  id: string;
  marketId: string;
  isYes: boolean;
  shares: bigint;
  costBasis: bigint;
}

interface MarketInfo {
  status: 'open' | 'resolved' | 'cancelled';
  outcome: boolean | undefined;
  question: string;
}

function parsePosition(obj: SuiObjectResponse): ParsedPosition | null {
  const content = obj.data?.content;
  if (!content || !('fields' in content)) return null;
  const f = content.fields as Record<string, unknown>;
  return {
    id: obj.data?.objectId ?? '',
    marketId: String(f.market_id ?? ''),
    isYes: Boolean(f.is_yes ?? true),
    shares: BigInt(String(f.shares ?? '0')),
    costBasis: BigInt(String(f.cost_basis ?? '0')),
  };
}

function parseMarketStatus(n: number): 'open' | 'resolved' | 'cancelled' {
  if (n === 1) return 'resolved';
  if (n === 2) return 'cancelled';
  return 'open';
}

function parseOutcome(field: unknown): boolean | undefined {
  if (!field || typeof field !== 'object') return undefined;
  const o = field as Record<string, unknown>;
  if (Array.isArray(o.vec) && o.vec.length > 0) return Boolean(o.vec[0]);
  return undefined;
}

async function fetchMarketInfo(id: string): Promise<MarketInfo | null> {
  const client = getSuiClient();
  try {
    const obj = await client.getObject({ id, options: { showContent: true } });
    if (obj.data?.content?.dataType !== 'moveObject') return null;
    const f = obj.data.content.fields as Record<string, unknown>;
    return {
      status: parseMarketStatus(Number(f.status ?? 0)),
      outcome: parseOutcome(f.outcome),
      question: String(f.question ?? ''),
    };
  } catch {
    return null;
  }
}

export function createPadoPredictionAdapter(signAndExecute: SignAndExecuteFn): RecoveryAdapter {
  return {
    productName: 'Pado Prediction Positions',
    async discover(address) {
      const client = getSuiClient();
      const positions: ParsedPosition[] = [];
      let cursor: string | null | undefined;
      do {
        const page = await client.getOwnedObjects({
          owner: address,
          filter: { StructType: POSITION_TYPE },
          options: { showContent: true },
          cursor: cursor ?? undefined,
        });
        for (const obj of page.data) {
          const p = parsePosition(obj);
          if (p) positions.push(p);
        }
        cursor = page.nextCursor;
      } while (cursor);

      if (positions.length === 0) return [];

      const uniqueMarketIds = Array.from(new Set(positions.map((p) => p.marketId)));
      const marketResults = await Promise.allSettled(uniqueMarketIds.map(fetchMarketInfo));
      const marketById = new Map(
        uniqueMarketIds.map((id, i) => [
          id,
          marketResults[i].status === 'fulfilled' ? marketResults[i].value : null,
        ]),
      );

      return positions.map((pos): RecoverableItem => {
        const market = marketById.get(pos.marketId);
        const side = pos.isYes ? 'YES' : 'NO';
        const sharesDisplay = (Number(pos.shares) / 10 ** NUSDC_DECIMALS).toFixed(2);
        const questionShort = market?.question
          ? market.question.slice(0, 60) + (market.question.length > 60 ? '...' : '')
          : 'Market unavailable';

        const actions: RecoveryAction[] = [];

        if (!market) {
          actions.push({ label: 'Market data unavailable', disabled: true, disabledReason: 'Could not fetch market', execute: async () => ({ digest: '' }) });
        } else if (market.status === 'resolved') {
          const isWinner = market.outcome !== undefined && market.outcome === pos.isYes;
          if (isWinner) {
            actions.push({
              label: 'Claim winnings',
              execute: async () => {
                const tx = new Transaction();
                tx.moveCall({ target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_winnings`, arguments: [tx.object(pos.marketId), tx.object(pos.id)] });
                return signAndExecute(tx);
              },
            });
          } else {
            actions.push({
              label: 'Burn losing position',
              destructive: true,
              execute: async () => {
                const tx = new Transaction();
                tx.moveCall({ target: `${PREDICTION_PACKAGE_ID}::prediction_market::burn_losing_position`, arguments: [tx.object(pos.marketId), tx.object(pos.id)] });
                return signAndExecute(tx);
              },
            });
          }
        } else if (market.status === 'cancelled') {
          actions.push({
            label: 'Claim refund',
            execute: async () => {
              const tx = new Transaction();
              tx.moveCall({ target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_cancelled_refund`, arguments: [tx.object(pos.marketId), tx.object(pos.id)] });
              return signAndExecute(tx);
            },
          });
        } else {
          actions.push({ label: 'Sell on market', disabled: true, disabledReason: 'Market is open. Use the trading UI to place a sell order.', execute: async () => ({ digest: '' }) });
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
    },
  };
}
