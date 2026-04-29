import { useState, useCallback } from 'react';
import { useMyTickets } from '../hooks';
import { WinningNumbers } from './WinningNumbers';
import { useLotteryActions } from '../hooks';
import type { Ticket, LotteryRound, PrizeTier } from '../types';
import {
  countMatchingNumbers,
  getTierFromMatchCount,
  getTierLabel,
  getTierPayout,
} from '../types';
import { PRIZE_TIER } from '../constants';
import { formatNusdc } from '../lib/lottery-client';
import { getExplorerObjectUrl } from '@/lib/explorer';
import { CelebrationOverlay } from '../../../components/common';
import { type CelebrationPreset, CELEBRATION_COLORS } from '../../../lib/celebration';
import { playGameSound } from '../../../lib/sounds';

interface MyTicketListProps {
  roundId: string;
  round?: LotteryRound;
}

function getTierColorClasses(tier: PrizeTier): {
  border: string;
  bg: string;
  text: string;
} {
  switch (tier) {
    case PRIZE_TIER.JACKPOT:
      return {
        border: 'border-yellow-600 dark:border-yellow-500',
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        text: 'text-yellow-700 dark:text-yellow-400',
      };
    case PRIZE_TIER.SECOND:
      return {
        border: 'border-pd2',
        bg: 'bg-pd4/30 dark:bg-pd0/20',
        text: 'text-pd1 dark:text-pd3',
      };
    case PRIZE_TIER.THIRD:
      return {
        border: 'border-green-600 dark:border-green-500',
        bg: 'bg-green-50 dark:bg-green-900/20',
        text: 'text-green-700 dark:text-green-400',
      };
    default:
      return {
        border: 'border-pd2',
        bg: 'bg-theme-bg-secondary',
        text: 'text-theme-text-muted',
      };
  }
}

function tierToPreset(tier: PrizeTier): CelebrationPreset {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return 'large';
    case PRIZE_TIER.SECOND: return 'medium';
    case PRIZE_TIER.THIRD: return 'small';
    default: return 'small';
  }
}

function tierToColors(tier: PrizeTier): string[] {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return CELEBRATION_COLORS.gold;
    case PRIZE_TIER.SECOND: return CELEBRATION_COLORS.brand;
    case PRIZE_TIER.THIRD: return CELEBRATION_COLORS.mint;
    default: return CELEBRATION_COLORS.brand;
  }
}

function tierToSound(tier: PrizeTier) {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return 'winJackpot' as const;
    case PRIZE_TIER.SECOND: return 'winMedium' as const;
    case PRIZE_TIER.THIRD: return 'winSmall' as const;
    default: return 'winSmall' as const;
  }
}

function TicketCard({
  ticket,
  round,
  claimPrize,
  burnTicket,
  isClaiming,
  onClaimSuccess,
}: {
  ticket: Ticket;
  round?: LotteryRound;
  claimPrize: (roundId: string, ticketId: string) => Promise<boolean>;
  burnTicket: (roundId: string, ticketId: string) => Promise<boolean>;
  isClaiming: boolean;
  onClaimSuccess?: (preset: CelebrationPreset, colors: string[]) => void;
}) {

  const isDrawn = round?.status === 2 || round?.status === 3;
  const drawnNumbers = round?.drawnNumbers;

  const matchCount = drawnNumbers
    ? countMatchingNumbers(drawnNumbers, ticket.numbers)
    : 0;
  const tier = getTierFromMatchCount(matchCount);
  const isWinner = tier !== PRIZE_TIER.NONE;
  const canClaim = isWinner && !ticket.isClaimed && round?.status === 3;
  const canBurn = !isWinner && isDrawn && round?.status === 3;
  const tierColors = getTierColorClasses(tier);
  const prizeAmount = round && isWinner ? getTierPayout(round, tier) : 0n;

  const handleClaim = async () => {
    if (!round) return;
    const success = await claimPrize(round.id, ticket.id);
    if (success) {
      playGameSound(tierToSound(tier));
      onClaimSuccess?.(tierToPreset(tier), tierToColors(tier));
    }
  };

  const handleBurn = () => {
    if (round) {
      burnTicket(round.id, ticket.id);
    }
  };

  return (
    <div
      className={`
      p-3 rounded-lg border
      ${ticket.isClaimed ? 'border-pd2 bg-pd0/30' : ''}
      ${isWinner && !ticket.isClaimed ? `${tierColors.border} ${tierColors.bg}` : ''}
      ${!isWinner && isDrawn ? 'border-pd2 bg-theme-bg-secondary' : ''}
      ${!isDrawn ? 'border-theme-border bg-theme-bg-secondary' : ''}
    `}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme-text-primary">
            #{ticket.ticketId}
          </span>
          {ticket.isClaimed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pd2/40 text-theme-text-muted">Claimed</span>
          )}
          {isWinner && !ticket.isClaimed && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tierColors.bg} ${tierColors.text}`}>
              {getTierLabel(tier)}
              {prizeAmount > 0n && ` ${formatNusdc(prizeAmount)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={getExplorerObjectUrl(ticket.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-0.5 rounded text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary transition-colors inline-flex"
            title="View on Explorer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <span className="text-[11px] text-theme-text-muted tabular-nums">
            {new Date(ticket.purchaseTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        {ticket.numbers.map((num, i) => {
          const isMatch = drawnNumbers?.includes(num);
          return (
            <div
              key={i}
              className={`
                w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium
                ${
                  isMatch
                    ? 'bg-green-500 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-primary'
                }
              `}
            >
              {num}
            </div>
          );
        })}
        {isDrawn && (
          <span className="ml-auto text-xs text-theme-text-muted whitespace-nowrap">
            {matchCount}/5
          </span>
        )}
      </div>

      {canClaim && (
        <button
          onClick={handleClaim}
          disabled={isClaiming}
          className="w-full py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
        >
          {isClaiming ? 'Claiming...' : 'Claim Prize'}
        </button>
      )}

      {canBurn && (
        <button
          onClick={handleBurn}
          disabled={isClaiming}
          className="w-full py-1.5 bg-pd2 hover:bg-pd1 text-white rounded-md text-xs disabled:opacity-50"
        >
          {isClaiming ? 'Processing...' : 'Burn Ticket'}
        </button>
      )}
    </div>
  );
}

const INITIAL_COUNT = 3;
const PAGE_SIZE = 5;

export function MyTicketList({ roundId, round }: MyTicketListProps) {
  const { tickets, isLoading, error } = useMyTickets(roundId);
  const { claimPrize, burnTicket, isClaiming } = useLotteryActions();
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  // Celebration state (managed at list level)
  const [celebration, setCelebration] = useState<{
    preset: CelebrationPreset;
    colors: string[];
  } | null>(null);

  const handleClaimSuccess = useCallback(
    (preset: CelebrationPreset, colors: string[]) => {
      setCelebration({ preset, colors });
    },
    [],
  );

  const handleCelebrationComplete = useCallback(() => {
    setCelebration(null);
  }, []);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-theme-text-secondary">
        Loading your tickets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-400">
        Failed to load tickets
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="text-center py-8 text-theme-text-secondary">
        You have no tickets for this round
      </div>
    );
  }

  const hasMore = tickets.length > visibleCount;
  const visibleTickets = tickets.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-theme-text-primary">
        My Tickets ({tickets.length})
      </h3>

      {round?.drawnNumbers && (
        <div className="p-4 bg-theme-bg-secondary rounded-lg">
          <div className="text-sm text-theme-text-secondary mb-2">
            Winning Numbers
          </div>
          <WinningNumbers numbers={round.drawnNumbers} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {visibleTickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            round={round}
            claimPrize={claimPrize}
            burnTicket={burnTicket}
            isClaiming={isClaiming}
            onClaimSuccess={handleClaimSuccess}
          />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full py-2 text-sm font-medium text-pd3 hover:text-pd4 transition-colors"
        >
          Show More ({tickets.length - visibleCount} remaining)
        </button>
      )}

      {celebration && (
        <CelebrationOverlay
          preset={celebration.preset}
          trigger={true}
          colors={celebration.colors}
          onComplete={handleCelebrationComplete}
        />
      )}
    </div>
  );
}
