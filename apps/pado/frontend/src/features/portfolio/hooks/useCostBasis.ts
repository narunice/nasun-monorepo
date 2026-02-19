/**
 * useCostBasis Hook
 * Calculate cost basis and P&L from on-chain OrderFilled events
 *
 * Tracks weighted average purchase price per token, realized PnL (sells),
 * and unrealized PnL (current holdings vs avg buy price).
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { NETWORK_CONFIG, POOLS } from '../../../config/network';
import { getStoredBalanceManagerId } from '../../../lib/unified-margin';
import { getUnifiedPrice, type TokenSymbol } from '../../../lib/prices';

export interface CostBasisEntry {
  symbol: TokenSymbol;
  totalBought: number;
  totalSold: number;
  avgBuyPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  holdingQty: number;
}

export interface CostBasisResult {
  entries: CostBasisEntry[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  isLoading: boolean;
}

interface RawFilledJson {
  pool_id?: string;
  maker_balance_manager_id?: string;
  taker_balance_manager_id?: string;
  price?: string;
  base_quantity?: string;
  quantity?: string;
  taker_is_bid?: boolean;
  [key: string]: unknown;
}

const POOL_CONFIGS = [
  { pool: POOLS.NBTC_NUSDC, baseSymbol: 'NBTC' as TokenSymbol },
  { pool: POOLS.NASUN_NUSDC, baseSymbol: 'NSN' as TokenSymbol },
  { pool: POOLS.NETH_NUSDC, baseSymbol: 'NETH' as TokenSymbol },
  { pool: POOLS.NSOL_NUSDC, baseSymbol: 'NSOL' as TokenSymbol },
];

const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;
const ORDER_FILLED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

function safeBigInt(value: unknown): bigint {
  const str = String(value || '0');
  if (!/^\d+$/.test(str)) return 0n;
  return BigInt(str);
}

async function fetchCostBasis(balanceManagerId: string, senderAddress: string): Promise<CostBasisEntry[]> {
  const client = getSuiClient();

  // Sender filter only — Nasun RPC does not support compound All filters.
  // Filter by OrderFilled type client-side.
  const result = await client.queryEvents({
    query: { Sender: senderAddress },
    limit: 200,
    order: 'descending',
  });

  // Process chronologically (oldest first)
  const fills = [...result.data].reverse();
  const entries: CostBasisEntry[] = [];

  for (const { pool, baseSymbol } of POOL_CONFIGS) {
    const poolId = pool.id;
    const baseDecimals = pool.baseToken.decimals;
    const quoteDecimals = pool.quoteToken.decimals;

    let totalBought = 0;
    let totalSold = 0;
    let avgBuyPrice = 0;
    let realizedPnl = 0;

    for (const event of fills) {
      if (event.type !== ORDER_FILLED_TYPE) continue;
      const json = event.parsedJson as RawFilledJson | undefined;
      if (!json || json.pool_id !== poolId) continue;

      const isMaker = json.maker_balance_manager_id === balanceManagerId;
      const isTaker = json.taker_balance_manager_id === balanceManagerId;
      if (!isMaker && !isTaker) continue;

      const takerIsBid = Boolean(json.taker_is_bid);
      const isBid = isTaker ? takerIsBid : !takerIsBid;

      const price = Number(safeBigInt(json.price)) / Math.pow(10, quoteDecimals);
      const qty = Number(safeBigInt(json.base_quantity || json.quantity)) / Math.pow(10, baseDecimals);

      if (qty === 0) continue;

      if (isBid) {
        // Buy: update weighted average price
        const prevHolding = totalBought - totalSold;
        const newHolding = prevHolding + qty;
        if (newHolding > 0) {
          avgBuyPrice = (avgBuyPrice * prevHolding + price * qty) / newHolding;
        }
        totalBought += qty;
      } else {
        // Sell: realize PnL against average buy price
        realizedPnl += (price - avgBuyPrice) * qty;
        totalSold += qty;
      }
    }

    const holdingQty = totalBought - totalSold;
    const currentPrice = getUnifiedPrice(baseSymbol);
    const unrealizedPnl = holdingQty > 0
      ? (currentPrice - avgBuyPrice) * holdingQty
      : 0;

    // Only include tokens the user has traded
    if (totalBought > 0 || totalSold > 0) {
      entries.push({
        symbol: baseSymbol,
        totalBought,
        totalSold,
        avgBuyPrice: Math.round(avgBuyPrice * 100) / 100,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        holdingQty,
      });
    }
  }

  return entries;
}

export function useCostBasis(): CostBasisResult {
  const { account, status } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const adaptiveInterval = useAdaptiveInterval(30_000);

  const activeAddress = isZkConnected
    ? zkState?.address
    : (status === 'unlocked' ? account?.address : undefined);

  const balanceManagerId = activeAddress ? getStoredBalanceManagerId(activeAddress) : null;

  const { data: entries, isLoading } = useQuery({
    queryKey: ['costBasis', balanceManagerId, activeAddress],
    queryFn: () => fetchCostBasis(balanceManagerId!, activeAddress!),
    enabled: !!balanceManagerId && !!activeAddress && !!DEEPBOOK_PACKAGE,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });

  const safeEntries = entries ?? [];
  const totalRealizedPnl = safeEntries.reduce((sum, e) => sum + e.realizedPnl, 0);
  const totalUnrealizedPnl = safeEntries.reduce((sum, e) => sum + e.unrealizedPnl, 0);

  return {
    entries: safeEntries,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
    totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
    totalPnl: Math.round((totalRealizedPnl + totalUnrealizedPnl) * 100) / 100,
    isLoading,
  };
}
