/**
 * WinningClaimBanner
 *
 * Surfaces unclaimed winnings on a resolved market so winners actually
 * notice they have money to collect. Shown above PositionList when:
 *   - market.status === 'resolved'
 *   - user holds at least one Position whose isYes matches market.outcome
 *
 * Position objects only exist while unclaimed, so seeing a winning position
 * == "the user hasn't claimed yet". Once they click Claim in PositionList
 * below, the Position is consumed and the banner disappears on next refetch.
 */

import { useMemo } from 'react';
import type { PredictionMarket, Position } from '../types';
import { NUSDC_DECIMALS } from '../constants';

interface WinningClaimBannerProps {
  market: PredictionMarket;
  positions: Position[];
}

export function WinningClaimBanner({ market, positions }: WinningClaimBannerProps) {
  const totalWinningShares = useMemo(() => {
    if (market.status !== 'resolved' || market.outcome === undefined) return 0n;
    return positions
      .filter((p) => p.isYes === market.outcome)
      .reduce((sum, p) => sum + p.shares, 0n);
  }, [positions, market.status, market.outcome]);

  if (totalWinningShares === 0n) return null;

  const payout = Number(totalWinningShares) / Math.pow(10, NUSDC_DECIMALS);
  const outcomeLabel = market.outcome ? 'YES' : 'NO';

  return (
    <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400">
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
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-semibold text-green-500 dark:text-green-400">
            You won this market
          </h3>
          <p className="mt-1 text-sm text-theme-text-secondary">
            {outcomeLabel} resolved as the winning side. You have{' '}
            <strong className="font-mono text-theme-text-primary">
              {payout.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
            </strong>{' '}
            in unclaimed winnings on this market. Scroll down to{' '}
            <em>My Positions</em> and click <strong>Claim</strong> on each
            winning position to receive your payout.
          </p>
        </div>
      </div>
    </div>
  );
}
