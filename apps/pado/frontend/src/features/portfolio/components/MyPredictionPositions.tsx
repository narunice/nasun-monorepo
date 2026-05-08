/**
 * MyPredictionPositions
 *
 * Portfolio tab view of every Position NFT the user holds across prediction
 * markets. Groups positions by market, surfaces win/loss for resolved markets,
 * and exposes claim / burn / refund actions inline so users do not have to
 * navigate into each market to settle.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useMarkets,
  usePredictionPositions,
  usePredictionTrade,
} from '../../prediction';
import type { MarketWithOrderbook } from '../../prediction/hooks/useMarkets';
import type { PredictionMarket, Position } from '../../prediction/types';
import { NUSDC_DECIMALS } from '../../prediction/constants';
import { useTransactionSync } from '../../../hooks/useTransactionSync';

type StatusFilter = 'all' | 'open' | 'resolved' | 'cancelled';

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'cancelled', label: 'Cancelled' },
];

interface MarketGroup {
  market: PredictionMarket;
  positions: Position[];
}

export function MyPredictionPositions() {
  const { positions, isLoading: positionsLoading, refetch: refetchPositions } = usePredictionPositions();
  const { markets, isLoading: marketsLoading } = useMarkets();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const marketsById = useMemo(() => {
    const map = new Map<string, MarketWithOrderbook>();
    for (const m of markets) map.set(m.market.id, m);
    return map;
  }, [markets]);

  const groups = useMemo<MarketGroup[]>(() => {
    const byMarket = new Map<string, Position[]>();
    for (const p of positions) {
      const list = byMarket.get(p.marketId) ?? [];
      list.push(p);
      byMarket.set(p.marketId, list);
    }
    const result: MarketGroup[] = [];
    for (const [marketId, ps] of byMarket) {
      const market = marketsById.get(marketId)?.market;
      if (!market) continue; // market list may still be loading
      result.push({ market, positions: ps });
    }
    // Sort: open first, then cancelled, then resolved (newest by closeTime).
    const statusRank = (s: PredictionMarket['status']) =>
      s === 'open' ? 0 : s === 'cancelled' ? 1 : 2;
    result.sort((a, b) => {
      const r = statusRank(a.market.status) - statusRank(b.market.status);
      if (r !== 0) return r;
      return b.market.closeTime - a.market.closeTime;
    });
    return result;
  }, [positions, marketsById]);

  const filteredGroups = useMemo(
    () => (statusFilter === 'all' ? groups : groups.filter((g) => g.market.status === statusFilter)),
    [groups, statusFilter],
  );

  const isLoading = positionsLoading || marketsLoading;

  if (isLoading && groups.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-theme-bg-secondary rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-xl p-8 text-center">
        <p className="text-theme-text-secondary">
          You have no prediction market positions yet.
        </p>
        <Link
          to="/predict"
          className="inline-block mt-4 px-4 py-2 bg-pd1 hover:bg-pd1/80 text-white rounded-lg text-sm font-medium"
        >
          Browse markets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              statusFilter === tab.id
                ? 'bg-pd1 text-white'
                : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center text-sm text-theme-text-secondary">
          No positions match this filter.
        </div>
      ) : (
        filteredGroups.map((group) => (
          <MarketPositionGroup
            key={group.market.id}
            group={group}
            onSettled={refetchPositions}
          />
        ))
      )}
    </div>
  );
}

interface MarketPositionGroupProps {
  group: MarketGroup;
  onSettled: () => void;
}

function MarketPositionGroup({ group, onSettled }: MarketPositionGroupProps) {
  const { market, positions } = group;
  const { isLoading, claimWinnings, burnLosingPosition, claimCancelledRefund } = usePredictionTrade();
  const { isSyncing, startSync } = useTransactionSync(onSettled);
  const [error, setError] = useState<string | null>(null);

  const divisor = Math.pow(10, NUSDC_DECIMALS);
  const totals = useMemo(() => {
    let yesShares = 0n;
    let noShares = 0n;
    let costBasis = 0n;
    for (const p of positions) {
      if (p.isYes) yesShares += p.shares;
      else noShares += p.shares;
      costBasis += p.costBasis;
    }
    return {
      yesShares: Number(yesShares) / divisor,
      noShares: Number(noShares) / divisor,
      costBasis: Number(costBasis) / divisor,
    };
  }, [positions, divisor]);

  const handleSettle = useCallback(
    async (position: Position) => {
      setError(null);
      if (market.status === 'cancelled') {
        const result = await claimCancelledRefund(market.id, position.id);
        if (!result.success) setError(result.error || 'Failed to claim refund');
        else startSync();
        return;
      }
      if (market.status !== 'resolved') return;
      const isWinning = position.isYes === market.outcome;
      const result = isWinning
        ? await claimWinnings(market.id, position.id)
        : await burnLosingPosition(market.id, position.id);
      if (!result.success) setError(result.error || 'Failed to settle position');
      else startSync();
    },
    [market.id, market.status, market.outcome, claimWinnings, burnLosingPosition, claimCancelledRefund, startSync],
  );

  const statusChip = renderStatusChip(market);
  const summaryChip = renderSummaryChip(market, totals);

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/predict/${market.id}`}
            className="text-base font-semibold text-theme-text-primary hover:text-pd2 transition-colors line-clamp-2"
          >
            {market.question}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-theme-text-muted">
            <span className="capitalize">{market.category}</span>
            {statusChip}
            <span>
              Cost basis{' '}
              <span className="text-theme-text-secondary font-mono">
                {formatShares(totals.costBasis)} NUSDC
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-1 shrink-0">
          {summaryChip}
          <Link
            to={`/predict/${market.id}`}
            className="text-xs text-theme-text-secondary hover:text-pd2 whitespace-nowrap underline-offset-4 hover:underline"
          >
            View market →
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        {positions.map((p) => (
          <PositionRow
            key={p.id}
            position={p}
            market={market}
            onSettle={handleSettle}
            isLoading={isLoading || isSyncing}
          />
        ))}
      </div>

      {isSyncing && (
        <div className="text-pd3 text-sm bg-pd2/25 rounded-lg p-2">
          Syncing with blockchain...
        </div>
      )}
      {error && (
        <div className="text-red-500 text-sm bg-red-500/20 rounded-lg p-2">{error}</div>
      )}
    </div>
  );
}

function PositionRow({
  position,
  market,
  onSettle,
  isLoading,
}: {
  position: Position;
  market: PredictionMarket;
  onSettle: (position: Position) => void;
  isLoading: boolean;
}) {
  const divisor = Math.pow(10, NUSDC_DECIMALS);
  const shares = Number(position.shares) / divisor;
  const cost = Number(position.costBasis) / divisor;
  const avgPrice = position.shares > 0n ? cost / shares : 0;
  const sideLabel = position.isYes ? 'YES' : 'NO';
  const sideColor = position.isYes
    ? 'text-green-700 dark:text-green-400'
    : 'text-red-700 dark:text-red-400';

  const isResolved = market.status === 'resolved';
  const isWinning = isResolved && position.isYes === market.outcome;
  const isLosing = isResolved && position.isYes !== market.outcome;
  const isCancelled = market.status === 'cancelled';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5 bg-theme-bg-tertiary rounded-lg">
      <div className="flex items-center gap-3 text-sm min-w-0">
        <span className={`font-bold w-10 shrink-0 ${sideColor}`}>{sideLabel}</span>
        <span className="text-theme-text-primary font-mono">
          {formatShares(shares)} shares
        </span>
        <span className="text-theme-text-muted">
          @ {avgPrice.toFixed(2)} NUSDC
        </span>
      </div>
      <div className="flex items-center gap-2">
        {market.status === 'open' && (
          <Link
            to={`/predict/${market.id}`}
            className="px-3 py-1.5 bg-theme-bg-secondary hover:bg-theme-bg-primary text-theme-text-primary rounded-lg text-xs font-medium"
          >
            Manage
          </Link>
        )}
        {isWinning && (
          <button
            onClick={() => onSettle(position)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            Claim {formatShares(shares)} NUSDC
          </button>
        )}
        {isLosing && (
          <button
            onClick={() => onSettle(position)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-pd2/40 hover:bg-pd2/60 text-theme-text-primary rounded-lg text-xs font-medium disabled:opacity-50"
          >
            Burn losing position
          </button>
        )}
        {isCancelled && (
          <button
            onClick={() => onSettle(position)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            Claim {formatShares(shares / 2)} NUSDC refund
          </button>
        )}
      </div>
    </div>
  );
}

function renderStatusChip(market: PredictionMarket): React.ReactNode {
  if (market.status === 'resolved') {
    const winLabel = market.outcome ? 'YES Won' : 'NO Won';
    const color = market.outcome
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return <span className={`px-2 py-0.5 rounded ${color}`}>{winLabel}</span>;
  }
  if (market.status === 'cancelled') {
    return (
      <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        Cancelled
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Open
    </span>
  );
}

function renderSummaryChip(
  market: PredictionMarket,
  totals: { yesShares: number; noShares: number; costBasis: number },
): React.ReactNode {
  if (market.status === 'resolved') {
    const winningShares = market.outcome ? totals.yesShares : totals.noShares;
    const pnl = winningShares - totals.costBasis;
    const isWin = winningShares > 0;
    const color = isWin
      ? 'text-green-700 dark:text-green-400'
      : 'text-red-700 dark:text-red-400';
    return (
      <div className={`text-sm font-semibold whitespace-nowrap ${color}`}>
        {isWin ? '+' : ''}
        {pnl.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
      </div>
    );
  }
  return null;
}

function formatShares(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
