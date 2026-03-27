import { useMemo } from 'react';
import type { LotteryRound } from '../types';
import { getStatusLabel } from '../types';
import { formatNusdc } from '../lib/lottery-client';
import { LotteryCountdown } from './LotteryCountdown';
import { WinningNumbers } from './WinningNumbers';
import { ROUND_STATUS } from '../constants';

interface LotteryRoundCardProps {
  round: LotteryRound;
  onClick?: () => void;
  isActive?: boolean;
  // Keeper actions (optional)
  onCloseRound?: () => void;
  onDrawNumbers?: () => void;
  isKeeperLoading?: boolean;
}

export function LotteryRoundCard({
  round,
  onClick,
  isActive = false,
  onCloseRound,
  onDrawNumbers,
  isKeeperLoading = false,
}: LotteryRoundCardProps) {
  const statusLabel = getStatusLabel(round.status);
  const totalPool = round.prizePool + round.rolloverIn;
  const now = Date.now();

  // Keeper button visibility conditions
  const canClose = round.status === ROUND_STATUS.OPEN && now >= round.closeTime;
  const canDraw = round.status === ROUND_STATUS.CLOSED && now >= round.drawTime;

  const statusColor = useMemo(() => {
    switch (statusLabel) {
      case 'open':
        return 'bg-green-600';
      case 'closed':
        return 'bg-yellow-600';
      case 'drawn':
        return 'bg-pd1';
      case 'settled':
        return 'bg-pd2';
      default:
        return 'bg-pd2';
    }
  }, [statusLabel]);

  const isOpen = statusLabel === 'open' && Date.now() < round.closeTime;

  return (
    <div
      onClick={onClick}
      className={`
        bg-theme-bg-secondary rounded-lg p-4 transition-all
        ${onClick ? 'cursor-pointer hover:bg-theme-bg-hover' : ''}
        ${isActive ? 'ring-2 ring-theme-accent' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          Round #{round.roundNumber}
        </h3>
        <span
          className={`px-2 py-1 rounded text-xs font-medium text-white uppercase ${statusColor}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Prize Pool */}
      <div className="mb-4">
        <div className="text-theme-text-secondary text-sm">Prize Pool</div>
        <div className="text-2xl font-bold text-theme-accent">
          {formatNusdc(totalPool)} NUSDC
        </div>
        {round.rolloverIn > 0n && (
          <div className="text-xs text-theme-text-secondary">
            (Includes {formatNusdc(round.rolloverIn)} NUSDC rollover)
          </div>
        )}
      </div>

      {/* Countdown or Winning Numbers */}
      {isOpen ? (
        <div className="mb-4">
          <div className="text-theme-text-secondary text-sm mb-1">
            Sales close in
          </div>
          <LotteryCountdown targetTime={round.closeTime} />
        </div>
      ) : round.drawnNumbers ? (
        <div className="mb-4">
          <div className="text-theme-text-secondary text-sm mb-1">
            Winning Numbers
          </div>
          <WinningNumbers numbers={round.drawnNumbers} />
        </div>
      ) : (
        <div className="mb-4 text-theme-text-secondary text-sm">
          Awaiting draw...
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-theme-text-secondary">Tickets Sold: </span>
          <span className="text-theme-text-primary font-medium">
            {round.ticketCount}
          </span>
        </div>
        <div>
          <span className="text-theme-text-secondary">Total Sales: </span>
          <span className="text-theme-text-primary font-medium">
            {formatNusdc(round.totalSales)} NUSDC
          </span>
        </div>
      </div>

      {/* Keeper Actions */}
      {(canClose && onCloseRound) || (canDraw && onDrawNumbers) ? (
        <div className="mt-3 pt-3 border-t border-theme-border">
          {canClose && onCloseRound && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseRound();
              }}
              disabled={isKeeperLoading}
              className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isKeeperLoading ? 'Processing...' : 'Close Sales'}
            </button>
          )}
          {canDraw && onDrawNumbers && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDrawNumbers();
              }}
              disabled={isKeeperLoading}
              className="w-full py-2 bg-pd1 hover:bg-pd1/80 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isKeeperLoading ? 'Processing...' : 'Trigger Draw'}
            </button>
          )}
        </div>
      ) : null}

      {/* Winner Info (if settled) */}
      {statusLabel === 'settled' && (
        <div className="mt-3 pt-3 border-t border-theme-border space-y-2">
          {/* Tier 1 - Jackpot */}
          <div className="text-sm flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
              Jackpot
            </span>
            <span className="text-theme-text-secondary">
              {round.tier1Winners} winner{round.tier1Winners !== 1 ? 's' : ''}
            </span>
            {round.tier1Winners > 0 && (
              <span className="text-yellow-700 dark:text-yellow-400 font-medium">
                ({formatNusdc(round.tier1PayoutPerWinner)} each)
              </span>
            )}
          </div>

          {/* Tier 2 - 4 Matches */}
          <div className="text-sm flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-pd4/30 dark:bg-pd0/30 text-pd1 dark:text-pd3">
              2nd Prize
            </span>
            <span className="text-theme-text-secondary">
              {round.tier2Winners} winner{round.tier2Winners !== 1 ? 's' : ''}
            </span>
            {round.tier2Winners > 0 && (
              <span className="text-pd1 dark:text-pd3 font-medium">
                ({formatNusdc(round.tier2PayoutPerWinner)} each)
              </span>
            )}
          </div>

          {/* Tier 3 - 3 Matches */}
          <div className="text-sm flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              3rd Prize
            </span>
            <span className="text-theme-text-secondary">
              {round.tier3Winners} winner{round.tier3Winners !== 1 ? 's' : ''}
            </span>
            {round.tier3Winners > 0 && (
              <span className="text-green-700 dark:text-green-400 font-medium">
                ({formatNusdc(round.tier3PayoutPerWinner)} each)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
