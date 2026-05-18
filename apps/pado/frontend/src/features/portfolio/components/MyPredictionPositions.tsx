/**
 * MyPredictionPositions
 *
 * Portfolio tab view of every Position NFT the user holds across prediction
 * markets. Groups positions by market, surfaces win/loss for resolved markets,
 * and exposes split bulk-action controls (Claim All / Burn All / Refund All)
 * so a holder with dozens of resolved markets can settle in one flow without
 * scrolling through every row.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
type ActionKind = 'claim' | 'burn' | 'refund';

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'cancelled', label: 'Cancelled' },
];

// PTB input-object cap is ~2048 on mainnet; keep conservative.
const CLAIM_CHUNK_SIZE = 100;
// Cross-market single-PTB cap. Each action contributes 1 command + up to 2
// inputs (market + position). 150 actions = ~300 inputs, well under 2048,
// and well under the 1024 command cap. Chunks above this re-prompt the
// wallet for a second signature.
const MULTI_MARKET_CHUNK_SIZE = 150;

// Progressive load: avoids unbounded DOM for users holding positions across
// many markets. Tuned against a typical viewport ~10 cards.
const MARKETS_PER_PAGE = 10;
const POSITIONS_PER_GROUP_DEFAULT = 5;

interface MarketGroup {
  market: PredictionMarket;
  positions: Position[];
}

interface GroupActions {
  wins: Position[];
  losses: Position[];
  refunds: Position[];
}

function classifyGroup(group: MarketGroup): GroupActions {
  const { market, positions } = group;
  if (market.status === 'cancelled') {
    return { wins: [], losses: [], refunds: positions };
  }
  if (market.status === 'resolved' && market.outcome !== undefined) {
    const wins: Position[] = [];
    const losses: Position[] = [];
    for (const p of positions) {
      if (p.isYes === market.outcome) wins.push(p);
      else losses.push(p);
    }
    return { wins, losses, refunds: [] };
  }
  return { wins: [], losses: [], refunds: [] };
}

function actionsFor(actions: GroupActions, kind: ActionKind | 'all'): Position[] {
  if (kind === 'claim') return actions.wins;
  if (kind === 'burn') return actions.losses;
  if (kind === 'refund') return actions.refunds;
  return [...actions.wins, ...actions.losses, ...actions.refunds];
}

interface BulkProgress {
  kind: ActionKind | 'all';
  chunksDone: number;
  chunksTotal: number;
  positionsDone: number;
  positionsTotal: number;
}

type MultiItem = { marketId: string; position: readonly string[]; kind: ActionKind };

function kindForPosition(group: MarketGroup, position: Position): ActionKind | null {
  const { market } = group;
  if (market.status === 'cancelled') return 'refund';
  if (market.status === 'resolved' && market.outcome !== undefined) {
    return position.isYes === market.outcome ? 'claim' : 'burn';
  }
  return null;
}

export function MyPredictionPositions() {
  const {
    positions,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = usePredictionPositions();
  const { markets, isLoading: marketsLoading } = useMarkets();
  const { settleMultiMarketBatch } = usePredictionTrade();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [displayMarketCount, setDisplayMarketCount] = useState(MARKETS_PER_PAGE);
  const [bulkPhase, setBulkPhase] = useState<'idle' | 'running' | 'syncing'>('idle');
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

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

  const groupCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: groups.length, open: 0, resolved: 0, cancelled: 0 };
    for (const g of groups) counts[g.market.status]++;
    return counts;
  }, [groups]);

  const filteredGroups = useMemo(
    () => (statusFilter === 'all' ? groups : groups.filter((g) => g.market.status === statusFilter)),
    [groups, statusFilter],
  );

  // Reset progressive load whenever filter changes so users don't see a stale
  // "Load more" count from the previous tab.
  useEffect(() => {
    setDisplayMarketCount(MARKETS_PER_PAGE);
  }, [statusFilter]);

  const visibleGroups = useMemo(
    () => filteredGroups.slice(0, displayMarketCount),
    [filteredGroups, displayMarketCount],
  );
  const remainingGroups = Math.max(0, filteredGroups.length - visibleGroups.length);

  // Bulk totals across ALL resolved + cancelled groups (regardless of filter)
  // so the action bar reflects the wallet, not the current tab view.
  const bulkTotals = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let refunds = 0;
    for (const g of groups) {
      const a = classifyGroup(g);
      wins += a.wins.length;
      losses += a.losses.length;
      refunds += a.refunds.length;
    }
    return { wins, losses, refunds, total: wins + losses + refunds };
  }, [groups]);

  const runBulk = useCallback(
    async (kind: ActionKind | 'all') => {
      if (bulkPhase !== 'idle') return;

      // Flatten work across every group into a single list. Each item carries
      // its own marketId so the PTB can settle positions from different markets
      // in one signature — the prior per-market loop forced N wallet popups,
      // and users who cancelled mid-flow ended up with the symptom this fix
      // targets (positions still claimable after a "Settle All" run).
      //
      // Within each market group, lots are bucketed by (marketId, isYes) so the
      // PTB auto-merges each bucket into a single Position before claim/burn/
      // refund. This collapses N fragmented Position NFTs into one moveCall pair
      // per bucket (one merge + one claim) instead of N separate claims.
      const items: MultiItem[] = [];
      for (const g of groups) {
        const targetPositions = actionsFor(classifyGroup(g), kind);
        // Group by (isYes, kind) — the kind is determined per Position via
        // `kindForPosition`, but for a given market it depends only on isYes
        // (winning vs losing vs refund), so bucketing by isYes implicitly
        // bucket by kind too.
        const buckets = new Map<string, { ids: string[]; kind: ActionKind }>();
        for (const p of targetPositions) {
          const k = kindForPosition(g, p);
          if (k === null) continue;
          const bucketKey = `${p.isYes ? 'Y' : 'N'}`;
          const existing = buckets.get(bucketKey);
          if (existing) {
            existing.ids.push(p.id);
          } else {
            buckets.set(bucketKey, { ids: [p.id], kind: k });
          }
        }
        for (const { ids, kind: k } of buckets.values()) {
          items.push({ marketId: g.market.id, position: ids, kind: k });
        }
      }
      if (items.length === 0) return;

      const chunks: MultiItem[][] = [];
      for (let i = 0; i < items.length; i += MULTI_MARKET_CHUNK_SIZE) {
        chunks.push(items.slice(i, i + MULTI_MARKET_CHUNK_SIZE));
      }

      // Track underlying lot count (not bucket count) for the user-facing
      // progress bar — each bucket may contain N fragmented Positions.
      const totalLots = items.reduce((sum, it) => sum + it.position.length, 0);

      setBulkPhase('running');
      setBulkProgress({
        kind,
        chunksDone: 0,
        chunksTotal: chunks.length,
        positionsDone: 0,
        positionsTotal: totalLots,
      });

      let positionsDone = 0;
      const startedAt = Date.now();

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const chunkStart = Date.now();
        const result = await settleMultiMarketBatch(chunk);
        const chunkLots = chunk.reduce((sum, it) => sum + it.position.length, 0);
        console.info(
          `[bulk-${kind}] chunk ${ci + 1}/${chunks.length} buckets=${chunk.length} lots=${chunkLots} elapsed=${Date.now() - chunkStart}ms ok=${result.success}`,
        );
        if (!result.success) break;
        positionsDone += chunkLots;
        setBulkProgress((prev) =>
          prev ? { ...prev, chunksDone: ci + 1, positionsDone } : prev,
        );
        refetchPositions();
      }

      console.info(
        `[bulk-${kind}] settled=${positionsDone}/${totalLots} elapsed=${Date.now() - startedAt}ms`,
      );
      setBulkProgress(null);
      setBulkPhase('syncing');
      refetchPositions();
      setTimeout(() => setBulkPhase('idle'), 8_000);
    },
    [bulkPhase, groups, settleMultiMarketBatch, refetchPositions],
  );

  const bulkDisabled = bulkPhase !== 'idle';
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
      {bulkTotals.total > 0 && (
        <BulkActionBar
          totals={bulkTotals}
          progress={bulkProgress}
          phase={bulkPhase}
          disabled={bulkDisabled}
          onRun={runBulk}
        />
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
            <span className="ml-1.5 text-xs opacity-80">{groupCounts[tab.id]}</span>
          </button>
        ))}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center text-sm text-theme-text-secondary">
          No positions match this filter.
        </div>
      ) : (
        <>
          {visibleGroups.map((group) => (
            <MarketPositionGroup
              key={group.market.id}
              group={group}
              onSettled={refetchPositions}
              externallyBusy={bulkDisabled}
            />
          ))}

          {remainingGroups > 0 && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() =>
                  setDisplayMarketCount((n) =>
                    Math.min(n + MARKETS_PER_PAGE, filteredGroups.length),
                  )
                }
                className="min-h-[40px] px-5 py-2 bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg text-sm font-medium"
              >
                Load {Math.min(MARKETS_PER_PAGE, remainingGroups)} more
                <span className="ml-1.5 text-xs text-theme-text-muted">
                  ({remainingGroups} remaining)
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface BulkActionBarProps {
  totals: { wins: number; losses: number; refunds: number; total: number };
  progress: BulkProgress | null;
  phase: 'idle' | 'running' | 'syncing';
  disabled: boolean;
  onRun: (kind: ActionKind | 'all') => void;
}

function BulkActionBar({ totals, progress, phase, disabled, onRun }: BulkActionBarProps) {
  const distinctKinds = [totals.wins > 0, totals.losses > 0, totals.refunds > 0].filter(Boolean).length;
  const showCombined = distinctKinds >= 2;

  const headline =
    phase === 'syncing'
      ? 'Syncing with blockchain...'
      : progress
        ? progress.chunksTotal > 1
          ? `Settling ${progress.positionsDone}/${progress.positionsTotal} (chunk ${Math.min(progress.chunksDone + 1, progress.chunksTotal)}/${progress.chunksTotal})`
          : `Settling ${progress.positionsTotal} position${progress.positionsTotal === 1 ? '' : 's'}...`
        : `${totals.total} position${totals.total === 1 ? '' : 's'} ready to settle across resolved and cancelled markets`;

  return (
    <div className="rounded-xl border border-pd1/30 bg-pd1/10 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-theme-text-primary">{headline}</p>
        <p className="text-xs text-theme-text-muted mt-0.5">
          All markets bundled into a single signature (up to {MULTI_MARKET_CHUNK_SIZE} positions per transaction).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {totals.wins > 0 && (
          <button
            type="button"
            onClick={() => onRun('claim')}
            disabled={disabled}
            className="min-h-[40px] px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium text-sm disabled:opacity-60"
          >
            Claim All Winnings ({totals.wins})
          </button>
        )}
        {totals.losses > 0 && (
          <button
            type="button"
            onClick={() => onRun('burn')}
            disabled={disabled}
            className="min-h-[40px] px-4 py-2 bg-pd2/60 hover:bg-pd2/80 text-theme-text-primary rounded-lg font-medium text-sm disabled:opacity-60"
          >
            Burn All Losing ({totals.losses})
          </button>
        )}
        {totals.refunds > 0 && (
          <button
            type="button"
            onClick={() => onRun('refund')}
            disabled={disabled}
            className="min-h-[40px] px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-medium text-sm disabled:opacity-60"
          >
            Refund All Cancelled ({totals.refunds})
          </button>
        )}
        {showCombined && (
          <button
            type="button"
            onClick={() => onRun('all')}
            disabled={disabled}
            className="min-h-[40px] px-4 py-2 bg-pd1 hover:bg-pd1/80 text-white rounded-lg font-medium text-sm disabled:opacity-60"
          >
            Settle Everything ({totals.total})
          </button>
        )}
      </div>
    </div>
  );
}

interface MarketPositionGroupProps {
  group: MarketGroup;
  onSettled: () => void;
  externallyBusy: boolean;
}

function MarketPositionGroup({ group, onSettled, externallyBusy }: MarketPositionGroupProps) {
  const { market, positions } = group;
  const {
    isLoading,
    claimWinnings,
    burnLosingPosition,
    claimCancelledRefund,
    settlePositionsBatch,
    settleRefundsBatch,
  } = usePredictionTrade();
  const { isSyncing, startSync } = useTransactionSync(onSettled);
  const [error, setError] = useState<string | null>(null);
  const [claimPhase, setClaimPhase] = useState<'idle' | 'claiming' | 'syncing'>('idle');
  const [claimProgress, setClaimProgress] = useState<{ done: number; total: number; kind: ActionKind | 'all' } | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  const actions = useMemo(() => classifyGroup({ market, positions }), [market, positions]);

  const runGroupBulk = useCallback(
    async (kind: ActionKind | 'all') => {
      if (claimPhase !== 'idle') return;
      const items = actionsFor(actions, kind);
      if (items.length === 0) return;
      const isCancelled = market.status === 'cancelled';
      const outcome = market.outcome;

      setClaimPhase('claiming');
      setClaimProgress({ done: 0, total: items.length, kind });
      const startedAt = Date.now();
      let done = 0;

      // Bucket the chunk by isYes so each side's fragmented lots get one merge
      // + one claim/burn/refund, instead of N separate consumed Positions.
      function bucketChunk(chunk: Position[]) {
        const yesIds: string[] = [];
        const noIds: string[] = [];
        for (const p of chunk) {
          (p.isYes ? yesIds : noIds).push(p.id);
        }
        return { yesIds, noIds };
      }

      for (let i = 0; i < items.length; i += CLAIM_CHUNK_SIZE) {
        const chunk = items.slice(i, i + CLAIM_CHUNK_SIZE);
        const chunkStart = Date.now();
        const { yesIds, noIds } = bucketChunk(chunk);
        let result;
        if (isCancelled) {
          const buckets: string[][] = [];
          if (yesIds.length > 0) buckets.push(yesIds);
          if (noIds.length > 0) buckets.push(noIds);
          result = await settleRefundsBatch(market.id, buckets);
        } else {
          const batch: Array<{ position: readonly string[]; won: boolean }> = [];
          if (yesIds.length > 0) batch.push({ position: yesIds, won: true === outcome });
          if (noIds.length > 0) batch.push({ position: noIds, won: false === outcome });
          result = await settlePositionsBatch(market.id, batch);
        }
        console.info(
          `[settle-group-${kind}] market=${market.id.slice(0, 8)} chunk ${Math.floor(i / CLAIM_CHUNK_SIZE) + 1}/${Math.ceil(items.length / CLAIM_CHUNK_SIZE)} lots=${chunk.length} buckets=${(yesIds.length > 0 ? 1 : 0) + (noIds.length > 0 ? 1 : 0)} elapsed=${Date.now() - chunkStart}ms ok=${result.success}`,
        );
        if (!result.success) break;
        done += chunk.length;
        setClaimProgress({ done, total: items.length, kind });
        onSettled();
      }
      console.info(
        `[settle-group-${kind}] market=${market.id.slice(0, 8)} total=${done}/${items.length} elapsed=${Date.now() - startedAt}ms`,
      );
      setClaimProgress(null);
      setClaimPhase('syncing');
      onSettled();
      setTimeout(() => setClaimPhase('idle'), 8_000);
    },
    [actions, claimPhase, market.id, market.status, market.outcome, settlePositionsBatch, settleRefundsBatch, onSettled],
  );

  const handleSettle = useCallback(
    async (position: Position) => {
      setError(null);
      // Auto-merge sibling lots in the same (market, side) bucket so the
      // claim/burn/refund acts on one Position instead of N.
      const bucketIds = positions
        .filter((p) => p.isYes === position.isYes)
        .map((p) => p.id);

      if (market.status === 'cancelled') {
        const result = await claimCancelledRefund(market.id, bucketIds);
        if (!result.success) setError(result.error || 'Failed to claim refund');
        else startSync();
        return;
      }
      if (market.status !== 'resolved') return;
      const isWinning = position.isYes === market.outcome;
      const result = isWinning
        ? await claimWinnings(market.id, bucketIds)
        : await burnLosingPosition(market.id, bucketIds);
      if (!result.success) setError(result.error || 'Failed to settle position');
      else startSync();
    },
    [market.id, market.status, market.outcome, positions, claimWinnings, burnLosingPosition, claimCancelledRefund, startSync],
  );

  const statusChip = renderStatusChip(market);
  const summaryChip = renderSummaryChip(market, totals);

  const distinctKinds = [actions.wins.length > 0, actions.losses.length > 0, actions.refunds.length > 0].filter(Boolean).length;
  const showCombined = distinctKinds >= 2;
  const busy = claimPhase !== 'idle' || externallyBusy;

  const groupActionLabel = (kind: ActionKind | 'all', n: number) => {
    if (claimProgress && claimProgress.kind === kind) {
      return claimPhase === 'syncing'
        ? 'Syncing...'
        : `Settling ${claimProgress.done}/${claimProgress.total}...`;
    }
    if (kind === 'claim') return `Claim All (${n})`;
    if (kind === 'burn') return `Burn All (${n})`;
    if (kind === 'refund') return `Refund All (${n})`;
    return `Settle All (${n})`;
  };

  const visiblePositions = expanded
    ? positions
    : positions.slice(0, POSITIONS_PER_GROUP_DEFAULT);
  const hiddenCount = positions.length - visiblePositions.length;

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

      {/* Per-market split bulk buttons. Only render kinds that have items so the
          row stays compact for markets with a single position. */}
      {(actions.wins.length + actions.losses.length + actions.refunds.length) > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.wins.length > 0 && (
            <button
              type="button"
              onClick={() => runGroupBulk('claim')}
              disabled={busy}
              className="min-h-[40px] flex-1 min-w-[160px] py-2 px-3 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-500 disabled:opacity-60"
            >
              {groupActionLabel('claim', actions.wins.length)}
            </button>
          )}
          {actions.losses.length > 0 && (
            <button
              type="button"
              onClick={() => runGroupBulk('burn')}
              disabled={busy}
              className="min-h-[40px] flex-1 min-w-[160px] py-2 px-3 rounded-lg text-sm font-medium bg-pd2/40 hover:bg-pd2/60 text-theme-text-primary disabled:opacity-60"
            >
              {groupActionLabel('burn', actions.losses.length)}
            </button>
          )}
          {actions.refunds.length > 0 && (
            <button
              type="button"
              onClick={() => runGroupBulk('refund')}
              disabled={busy}
              className="min-h-[40px] flex-1 min-w-[160px] py-2 px-3 rounded-lg text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60"
            >
              {groupActionLabel('refund', actions.refunds.length)}
            </button>
          )}
          {showCombined && (
            <button
              type="button"
              onClick={() => runGroupBulk('all')}
              disabled={busy}
              className="min-h-[40px] flex-1 min-w-[160px] py-2 px-3 rounded-lg text-sm font-medium text-white bg-pd1 hover:bg-pd1/80 disabled:opacity-60"
            >
              {groupActionLabel('all', actions.wins.length + actions.losses.length + actions.refunds.length)}
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {visiblePositions.map((p) => (
          <PositionRow
            key={p.id}
            position={p}
            market={market}
            onSettle={handleSettle}
            isLoading={isLoading || isSyncing || busy}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full min-h-[36px] py-1.5 text-xs font-medium text-theme-text-secondary hover:text-theme-text-primary bg-theme-bg-tertiary/60 hover:bg-theme-bg-tertiary rounded-lg"
          >
            Show all {positions.length} positions ({hiddenCount} more)
          </button>
        )}
        {expanded && positions.length > POSITIONS_PER_GROUP_DEFAULT && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full min-h-[36px] py-1.5 text-xs font-medium text-theme-text-secondary hover:text-theme-text-primary bg-theme-bg-tertiary/60 hover:bg-theme-bg-tertiary rounded-lg"
          >
            Collapse
          </button>
        )}
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
