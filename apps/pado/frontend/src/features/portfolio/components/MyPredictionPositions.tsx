/**
 * MyPredictionPositions
 *
 * Portfolio tab view of every Position NFT the user holds across prediction
 * markets. Groups positions by market, surfaces win/loss for resolved markets,
 * and exposes claim / burn / settle-all actions inline so users do not have to
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

// PTB input-object cap is ~2048 on mainnet; keep conservative.
const CLAIM_CHUNK_SIZE = 100;

interface MarketGroup {
  market: PredictionMarket;
  positions: Position[];
}

function buildSettleable(
  positions: Position[],
  market: PredictionMarket,
): Array<{ positionId: string; won: boolean }> {
  if (market.status !== 'resolved' || market.outcome === undefined) return [];
  return positions.map((p) => ({ positionId: p.id, won: p.isYes === market.outcome }));
}

function settleAllLabel(settleable: Array<{ positionId: string; won: boolean }>): string {
  const wins = settleable.filter((p) => p.won).length;
  const losses = settleable.length - wins;
  const n = settleable.length;
  if (wins > 0 && losses > 0) return `Settle All (${n})`;
  if (wins > 0) return `Claim All (${n})`;
  return `Burn All (${n})`;
}

export function MyPredictionPositions() {
  const { positions, isLoading: positionsLoading, refetch: refetchPositions } = usePredictionPositions();
  const { markets, isLoading: marketsLoading } = useMarkets();
  const { settlePositionsBatch } = usePredictionTrade();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [globalPhase, setGlobalPhase] = useState<'idle' | 'settling' | 'syncing'>('idle');
  const [globalProgress, setGlobalProgress] = useState<{
    marketsDone: number;
    marketsTotal: number;
    label: string;
  } | null>(null);

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
      if (!market) continue;
      result.push({ market, positions: ps });
    }
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

  // Resolved groups with at least one settleable position.
  const resolvedGroups = useMemo(
    () =>
      groups.filter(
        (g) => g.market.status === 'resolved' && g.positions.length > 0 && g.market.outcome !== undefined,
      ),
    [groups],
  );

  const totalSettleable = useMemo(
    () => resolvedGroups.reduce((sum, g) => sum + g.positions.length, 0),
    [resolvedGroups],
  );

  const globalButtonLabel =
    globalPhase === 'syncing'
      ? 'Syncing...'
      : globalProgress
        ? `Settling market ${globalProgress.marketsDone + 1}/${globalProgress.marketsTotal} — ${globalProgress.label}`
        : (() => {
            const wins = resolvedGroups.reduce(
              (sum, g) => sum + g.positions.filter((p) => p.isYes === g.market.outcome).length,
              0,
            );
            const losses = totalSettleable - wins;
            if (wins > 0 && losses > 0) return `Settle All Resolved (${totalSettleable} positions)`;
            if (wins > 0) return `Claim All Resolved (${totalSettleable} positions)`;
            return `Burn All Resolved (${totalSettleable} positions)`;
          })();

  const handleSettleAllMarkets = useCallback(async () => {
    if (globalPhase !== 'idle' || resolvedGroups.length === 0) return;
    setGlobalPhase('settling');
    const total = resolvedGroups.length;
    const startedAt = Date.now();
    let totalSettled = 0;

    for (let gi = 0; gi < resolvedGroups.length; gi++) {
      const { market, positions } = resolvedGroups[gi];
      const work = buildSettleable(positions, market);
      if (work.length === 0) continue;

      setGlobalProgress({ marketsDone: gi, marketsTotal: total, label: settleAllLabel(work) });

      for (let i = 0; i < work.length; i += CLAIM_CHUNK_SIZE) {
        const chunk = work.slice(i, i + CLAIM_CHUNK_SIZE);
        const chunkStart = Date.now();
        const result = await settlePositionsBatch(market.id, chunk);
        console.info(
          `[settle-all-markets] market ${gi + 1}/${total} chunk ${Math.floor(i / CLAIM_CHUNK_SIZE) + 1}/${Math.ceil(work.length / CLAIM_CHUNK_SIZE)} size=${chunk.length} elapsed=${Date.now() - chunkStart}ms ok=${result.success}`,
        );
        if (!result.success) break; // per-market error toast shown by hook; continue to next market
        totalSettled += chunk.length;
        refetchPositions();
      }
    }

    console.info(`[settle-all-markets] total settled=${totalSettled} elapsed=${Date.now() - startedAt}ms`);
    setGlobalProgress(null);
    setGlobalPhase('syncing');
    refetchPositions();
    setTimeout(() => setGlobalPhase('idle'), 8_000);
  }, [globalPhase, resolvedGroups, settlePositionsBatch, refetchPositions]);

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
      {/* Global settle button: visible whenever there are resolved positions to clear */}
      {totalSettleable > 0 && (
        <div className="rounded-xl border border-pd1/30 bg-pd1/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-theme-text-primary">
              {resolvedGroups.length} resolved market{resolvedGroups.length === 1 ? '' : 's'} with{' '}
              {totalSettleable} position{totalSettleable === 1 ? '' : 's'} to settle
            </p>
            <p className="text-xs text-theme-text-muted mt-0.5">
              Settle across all resolved markets in one click. Bundled in chunks of {CLAIM_CHUNK_SIZE} per signature.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSettleAllMarkets}
            disabled={globalPhase !== 'idle'}
            className="shrink-0 min-h-[44px] px-4 py-2.5 bg-pd1 hover:bg-pd1/80 text-white rounded-lg font-medium text-sm disabled:opacity-60 whitespace-nowrap"
          >
            {globalButtonLabel}
          </button>
        </div>
      )}

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
  const { isLoading, claimWinnings, burnLosingPosition, claimCancelledRefund, settlePositionsBatch } = usePredictionTrade();
  const { isSyncing, startSync } = useTransactionSync(onSettled);
  const [error, setError] = useState<string | null>(null);
  const [claimPhase, setClaimPhase] = useState<'idle' | 'claiming' | 'syncing'>('idle');
  const [claimProgress, setClaimProgress] = useState<{ done: number; total: number } | null>(null);

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

  const settleable = useMemo(() => buildSettleable(positions, market), [positions, market]);
  const showSettleAll = market.status === 'resolved' && settleable.length >= 2;

  const handleSettleAll = useCallback(async () => {
    if (settleable.length === 0 || claimPhase !== 'idle') return;
    setClaimPhase('claiming');
    setClaimProgress({ done: 0, total: settleable.length });
    const startedAt = Date.now();
    let done = 0;
    for (let i = 0; i < settleable.length; i += CLAIM_CHUNK_SIZE) {
      const chunk = settleable.slice(i, i + CLAIM_CHUNK_SIZE);
      const chunkStart = Date.now();
      const result = await settlePositionsBatch(market.id, chunk);
      console.info(
        `[settle-all] market=${market.id.slice(0, 8)} chunk ${Math.floor(i / CLAIM_CHUNK_SIZE) + 1}/${Math.ceil(settleable.length / CLAIM_CHUNK_SIZE)} size=${chunk.length} elapsed=${Date.now() - chunkStart}ms ok=${result.success}`,
      );
      if (!result.success) break;
      done += chunk.length;
      setClaimProgress({ done, total: settleable.length });
      onSettled();
    }
    console.info(`[settle-all] market=${market.id.slice(0, 8)} total=${done}/${settleable.length} elapsed=${Date.now() - startedAt}ms`);
    setClaimProgress(null);
    setClaimPhase('syncing');
    onSettled();
    setTimeout(() => setClaimPhase('idle'), 8_000);
  }, [settleable, claimPhase, market.id, settlePositionsBatch, onSettled]);

  const settleAllButtonLabel =
    claimPhase === 'syncing'
      ? 'Syncing...'
      : claimProgress
        ? `Settling ${claimProgress.done} / ${claimProgress.total}...`
        : settleAllLabel(settleable);

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

      {/* Per-market Settle All button */}
      {showSettleAll && (
        <button
          type="button"
          onClick={handleSettleAll}
          disabled={claimPhase !== 'idle'}
          className={`w-full min-h-[40px] py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 ${
            settleable.some((p) => p.won)
              ? 'bg-green-600 hover:bg-green-500'
              : 'bg-pd1 hover:bg-pd1/80'
          }`}
        >
          {settleAllButtonLabel}
        </button>
      )}

      <div className="space-y-2">
        {positions.map((p) => (
          <PositionRow
            key={p.id}
            position={p}
            market={market}
            onSettle={handleSettle}
            isLoading={isLoading || isSyncing || claimPhase !== 'idle'}
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
