/**
 * Prediction Market On-chain Utilities
 */

import { getSuiClient } from '../../../lib/sui-client';
import { MARKET_TYPE, TEST_MARKETS } from '../constants';
import type { PredictionMarket } from '../types';
import { parseMarketStatus } from '../types';

/**
 * Fetch all prediction markets
 */
export async function fetchMarkets(): Promise<PredictionMarket[]> {
  const markets: PredictionMarket[] = [];

  // For now, fetch test markets by ID
  // In production, use event indexing or GraphQL
  for (const marketId of TEST_MARKETS) {
    try {
      const market = await fetchMarket(marketId);
      if (market) {
        markets.push(market);
      }
    } catch (error) {
      console.error(`Failed to fetch market ${marketId}:`, error);
    }
  }

  return markets;
}

/**
 * Fetch a single market by ID
 */
export async function fetchMarket(marketId: string): Promise<PredictionMarket | null> {
  const client = getSuiClient();

  try {
    const object = await client.getObject({
      id: marketId,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = object.data.content.fields as Record<string, unknown>;

    return parseMarketFields(marketId, fields);
  } catch (error) {
    console.error(`Failed to fetch market ${marketId}:`, error);
    return null;
  }
}

/**
 * Parse market fields from on-chain data
 */
function parseMarketFields(
  id: string,
  fields: Record<string, unknown>
): PredictionMarket {
  return {
    id,
    question: String(fields.question || ''),
    description: String(fields.description || ''),
    category: String(fields.category || ''),
    createdAt: Number(fields.created_at || 0),
    closeTime: Number(fields.close_time || 0),
    resolveDeadline: Number(fields.resolve_deadline || 0),
    yesSupply: BigInt(String(fields.yes_supply || '0')),
    noSupply: BigInt(String(fields.no_supply || '0')),
    collateralBalance: parseBalanceField(fields.collateral_pool),
    totalVolume: BigInt(String(fields.total_volume || '0')),
    status: parseMarketStatus(Number(fields.status || 0)),
    outcome: parseOutcomeField(fields.outcome),
    creator: String(fields.creator || ''),
    resolver: String(fields.resolver || ''),
  };
}

/**
 * Parse Balance<T> field
 */
function parseBalanceField(field: unknown): bigint {
  if (!field || typeof field !== 'object') return 0n;
  const balanceObj = field as Record<string, unknown>;
  return BigInt(String(balanceObj.value || '0'));
}

/**
 * Parse Option<bool> field
 */
function parseOutcomeField(field: unknown): boolean | undefined {
  if (!field || typeof field !== 'object') return undefined;
  const optionObj = field as Record<string, unknown>;
  if (optionObj.vec && Array.isArray(optionObj.vec) && optionObj.vec.length > 0) {
    return Boolean(optionObj.vec[0]);
  }
  return undefined;
}

/**
 * Fetch markets by querying events (for discovery)
 */
export async function fetchMarketsByEvents(): Promise<string[]> {
  const client = getSuiClient();

  try {
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${MARKET_TYPE.replace('::Market', '')}::MarketCreated`,
      },
      limit: 50,
    });

    return events.data.map((event) => {
      const parsed = event.parsedJson as { market_id?: string };
      return parsed.market_id || '';
    }).filter(Boolean);
  } catch (error) {
    console.error('Failed to fetch market events:', error);
    return TEST_MARKETS; // Fallback to test markets
  }
}
