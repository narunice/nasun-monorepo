/**
 * LotteryHighlight
 * Shows current lottery round info on the dashboard
 */

import { Link } from 'react-router-dom';
import { useLotteries } from '../../lottery';
import { formatNusdc } from '../../lottery/lib/lottery-client';

function formatTimeRemaining(closeTime: number): string {
  const diff = closeTime - Date.now();
  if (diff <= 0) return 'Closing soon';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m left`;
}

export function LotteryHighlight() {
  const { currentRound, isLoading } = useLotteries();

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-theme-bg-tertiary rounded w-1/3 mb-4" />
          <div className="h-16 bg-theme-bg-tertiary rounded" />
        </div>
      </div>
    );
  }

  // No active round — show CTA
  if (!currentRound) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h2 className="font-bold text-theme-text-primary mb-1">Pado Lottery</h2>
        <p className="text-xs text-theme-text-muted mb-3">Pick 5 numbers and win prizes every week</p>
        <Link to="/lottery" className="text-sm text-pd3 hover:text-pd4 font-medium">
          View Lottery &rarr;
        </Link>
      </div>
    );
  }

  // Active round
  const prizePool = currentRound.prizePool + currentRound.rolloverIn;

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-theme-text-primary">Pado Lottery</h2>
        <Link to="/lottery" className="text-xs text-pd3 hover:text-pd4">
          View All &rarr;
        </Link>
      </div>
      <p className="text-xs text-theme-text-muted mb-3">Pick 5 numbers from 1-32 for a chance to win</p>

      <Link
        to="/lottery"
        className="block p-3 -mx-1 rounded-lg hover:bg-theme-bg-tertiary transition-colors"
      >
        {/* Round info */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-theme-text-muted">
            Round #{currentRound.roundNumber}
          </span>
          <span className="text-xs text-theme-text-muted">
            {formatTimeRemaining(currentRound.closeTime)}
          </span>
        </div>

        {/* Prize pool */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-theme-text-secondary">Prize Pool</span>
          <span className="text-lg font-bold text-yellow-400">
            {formatNusdc(prizePool)} NUSDC
          </span>
        </div>

        {/* Tickets sold */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-theme-text-muted">Tickets sold</span>
          <span className="text-xs text-theme-text-secondary font-medium">
            {currentRound.ticketCount}
          </span>
        </div>
      </Link>
    </div>
  );
}
