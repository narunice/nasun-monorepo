/**
 * WinningClaimBanner
 *
 * Surfaces unclaimed Positions on a resolved market and provides a single
 * "Claim All" button that settles every Position (wins via `claim_winnings`,
 * losses via `burn_losing_position`) in chunked PTBs.
 *
 * Why this banner owns the bulk-claim driver:
 *   - A market with a deep orderbook can mint hundreds of Position NFTs for a
 *     single taker order (one per maker fill). Clicking Claim per row at
 *     scale (175, 598 in prod) is unworkable.
 *   - `settlePositionsBatch` already bundles N positions into one PTB; we
 *     just need a UI driver that chunks the list and loops.
 *
 * The per-row Claim button in PositionList is preserved for users with a
 * handful of positions or who want to inspect individual rows.
 */

import { useMemo, useState, useCallback } from 'react';
import type { PredictionMarket, Position } from '../types';
import { NUSDC_DECIMALS } from '../constants';
import { usePredictionTrade } from '../hooks/usePredictionTrade';

interface WinningClaimBannerProps {
  market: PredictionMarket;
  positions: Position[];
  onSettled?: () => void;
}

// PTB input-object cap is ~2048 on mainnet; devnet may be lower. Start
// conservative and raise after observing `[claim-all]` telemetry.
const CLAIM_CHUNK_SIZE = 100;

export function WinningClaimBanner({ market, positions, onSettled }: WinningClaimBannerProps) {
  const { settlePositionsBatch } = usePredictionTrade();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // 'claiming' = chunks in flight; 'syncing' = waiting for owned-object indexer
  // to catch up (~5-8s lag) before re-enabling the button.
  const [claimPhase, setClaimPhase] = useState<'idle' | 'claiming' | 'syncing'>('idle');

  const { winningShares, settleable, totalLots } = useMemo(() => {
    if (market.status !== 'resolved' || market.outcome === undefined) {
      return {
        winningShares: 0n,
        settleable: [] as Array<{ position: readonly string[]; won: boolean }>,
        totalLots: 0,
      };
    }
    const outcome = market.outcome;
    let wonShares = 0n;
    // Bucket by isYes — same-side Position lots are auto-merged in the PTB so
    // they consume one claim/burn moveCall per bucket (not per lot).
    const yesIds: string[] = [];
    const noIds: string[] = [];
    for (const p of positions) {
      if (p.isYes) {
        yesIds.push(p.id);
        if (outcome) wonShares += p.shares;
      } else {
        noIds.push(p.id);
        if (!outcome) wonShares += p.shares;
      }
    }
    const work: Array<{ position: readonly string[]; won: boolean }> = [];
    if (yesIds.length > 0) work.push({ position: yesIds, won: outcome === true });
    if (noIds.length > 0) work.push({ position: noIds, won: outcome === false });
    return { winningShares: wonShares, settleable: work, totalLots: yesIds.length + noIds.length };
  }, [positions, market.status, market.outcome]);

  const handleClaimAll = useCallback(async () => {
    if (settleable.length === 0 || claimPhase !== 'idle') return;
    setClaimPhase('claiming');
    setProgress({ done: 0, total: totalLots });
    const startedAt = Date.now();
    let done = 0;
    for (let i = 0; i < settleable.length; i += CLAIM_CHUNK_SIZE) {
      const chunk = settleable.slice(i, i + CLAIM_CHUNK_SIZE);
      const chunkStart = Date.now();
      const result = await settlePositionsBatch(market.id, chunk);
      const chunkLots = chunk.reduce((sum, c) => sum + c.position.length, 0);
      console.info(
        `[claim-all] chunk ${Math.floor(i / CLAIM_CHUNK_SIZE) + 1}/${Math.ceil(settleable.length / CLAIM_CHUNK_SIZE)} buckets=${chunk.length} lots=${chunkLots} elapsed=${Date.now() - chunkStart}ms ok=${result.success}`,
      );
      if (!result.success) {
        // settlePositionsBatch already showed an error toast. Enter syncing
        // phase so the button stays disabled while the indexer catches up.
        break;
      }
      done += chunkLots;
      setProgress({ done, total: totalLots });
      onSettled?.();
    }
    console.info(`[claim-all] total settled=${done}/${totalLots} elapsed=${Date.now() - startedAt}ms`);

    // Gate the button for 8s while the owned-object indexer catches up (5-8s
    // typical lag). Without this, a refetch still showing settled positions as
    // "remaining" would let the user immediately re-click and get ObjectDeleted.
    setProgress(null);
    setClaimPhase('syncing');
    onSettled?.();
    setTimeout(() => setClaimPhase('idle'), 8_000);
  }, [settleable, claimPhase, market.id, settlePositionsBatch, onSettled]);

  if (settleable.length === 0) return null;

  const hasWinnings = winningShares > 0n;
  const payout = Number(winningShares) / Math.pow(10, NUSDC_DECIMALS);
  const outcomeLabel = market.outcome ? 'YES' : 'NO';
  // settleable.length is bucket count (≤ 2: YES + NO); totalLots is the
  // underlying Position NFT count visible to the user.
  const showClaimAll = totalLots >= 2;
  const isBusy = claimPhase !== 'idle';

  const buttonLabel =
    claimPhase === 'syncing'
      ? 'Syncing...'
      : progress
        ? `Settling ${progress.done} / ${progress.total}…`
        : `Claim All (${totalLots} position${totalLots === 1 ? '' : 's'})`;

  return (
    <div
      className={`rounded-xl border p-4 md:p-5 ${
        hasWinnings
          ? 'border-green-500/40 bg-green-500/10'
          : 'border-theme-border bg-theme-bg-secondary'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            hasWinnings ? 'bg-green-500/20 text-green-400' : 'bg-theme-bg-tertiary text-theme-text-secondary'
          }`}
        >
          {hasWinnings ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={`text-base md:text-lg font-semibold ${
              hasWinnings ? 'text-green-500 dark:text-green-400' : 'text-theme-text-primary'
            }`}
          >
            {hasWinnings ? 'You won this market' : 'Settle your positions'}
          </h3>
          <p className="mt-1 text-sm text-theme-text-secondary">
            {hasWinnings ? (
              <>
                {outcomeLabel} resolved as the winning side. You have{' '}
                <strong className="font-mono text-theme-text-primary">
                  {payout.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
                </strong>{' '}
                in unclaimed winnings across{' '}
                <strong>{settleable.length}</strong> position
                {settleable.length === 1 ? '' : 's'}.
              </>
            ) : (
              <>
                This market resolved {outcomeLabel}. You hold{' '}
                <strong>{settleable.length}</strong> losing position
                {settleable.length === 1 ? '' : 's'} that can be burned to clear
                your row.
              </>
            )}
          </p>

          {showClaimAll && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <button
                type="button"
                onClick={handleClaimAll}
                disabled={isBusy}
                className={`min-h-[44px] px-4 py-2.5 rounded-lg font-medium text-white disabled:opacity-60 ${
                  hasWinnings ? 'bg-green-600 hover:bg-green-500' : 'bg-pd1 hover:bg-pd1/80'
                }`}
              >
                {buttonLabel}
              </button>
              <span className="text-xs text-theme-text-muted">
                Bundles up to {CLAIM_CHUNK_SIZE} positions per signature.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
