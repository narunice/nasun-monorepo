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
        border: 'border-yellow-500',
        bg: 'bg-yellow-900/20',
        text: 'text-yellow-400',
      };
    case PRIZE_TIER.SECOND:
      return {
        border: 'border-blue-500',
        bg: 'bg-blue-900/20',
        text: 'text-blue-400',
      };
    case PRIZE_TIER.THIRD:
      return {
        border: 'border-green-500',
        bg: 'bg-green-900/20',
        text: 'text-green-400',
      };
    default:
      return {
        border: 'border-gray-600',
        bg: 'bg-theme-bg-secondary',
        text: 'text-gray-400',
      };
  }
}

function TicketCard({
  ticket,
  round,
}: {
  ticket: Ticket;
  round?: LotteryRound;
}) {
  const { claimPrize, burnTicket, isClaiming } = useLotteryActions();

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

  const handleClaim = () => {
    if (round) {
      claimPrize(round.id, ticket.id);
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
      p-4 rounded-lg border
      ${ticket.isClaimed ? 'border-gray-500 bg-gray-900/30' : ''}
      ${isWinner && !ticket.isClaimed ? `${tierColors.border} ${tierColors.bg}` : ''}
      ${!isWinner && isDrawn ? 'border-gray-600 bg-theme-bg-secondary' : ''}
      ${!isDrawn ? 'border-theme-border bg-theme-bg-secondary' : ''}
    `}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-sm text-theme-text-secondary">
            Ticket #{ticket.ticketId}
          </div>
          {ticket.isClaimed && (
            <span className="text-xs text-gray-400">Claimed</span>
          )}
          {isWinner && !ticket.isClaimed && (
            <span className={`text-xs font-medium ${tierColors.text}`}>
              {getTierLabel(tier)} Winner!
              {prizeAmount > 0n && (
                <span className="ml-1">({formatNusdc(prizeAmount)} NUSDC)</span>
              )}
            </span>
          )}
        </div>
        <div className="text-xs text-theme-text-secondary">
          {new Date(ticket.purchaseTime).toLocaleDateString()}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {ticket.numbers.map((num, i) => {
          const isMatch = drawnNumbers?.includes(num);
          return (
            <div
              key={i}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center font-medium
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
      </div>

      {isDrawn && (
        <div className="text-sm text-theme-text-secondary mb-3">
          {matchCount} of 5 numbers matched
        </div>
      )}

      {canClaim && (
        <button
          onClick={handleClaim}
          disabled={isClaiming}
          className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {isClaiming ? 'Claiming...' : 'Claim Prize'}
        </button>
      )}

      {canBurn && (
        <button
          onClick={handleBurn}
          disabled={isClaiming}
          className="w-full py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {isClaiming ? 'Processing...' : 'Burn Ticket'}
        </button>
      )}
    </div>
  );
}

export function MyTicketList({ roundId, round }: MyTicketListProps) {
  const { tickets, isLoading, error } = useMyTickets(roundId);

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

      <div className="grid gap-3">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} round={round} />
        ))}
      </div>
    </div>
  );
}
