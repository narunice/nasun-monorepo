/**
 * LotteryPage
 * Weekly lottery listing and ticket purchase
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useLotteries,
  useLotteryKeeper,
  LotteryRoundCard,
  TicketPurchaseForm,
  MyTicketList,
  ROUND_STATUS,
  formatNusdc,
} from '../features/lottery';
import { Spinner } from '../components/common';

const PAST_ROUNDS_PAGE_SIZE = 5;

export function LotteryPage() {
  const { currentRound, rounds, isLoading, error, refetch } = useLotteries();
  const [pastRoundsVisible, setPastRoundsVisible] = useState(PAST_ROUNDS_PAGE_SIZE);

  // Past rounds: settled or closed/drawn, sorted by round number descending
  const pastRounds = rounds
    .filter((r) => r.id !== currentRound?.id && r.ticketCount > 0)
    .sort((a, b) => b.roundNumber - a.roundNumber);
  const { closeRound, drawNumbers, isLoading: isKeeperLoading } = useLotteryKeeper();

  const handleCloseRound = async () => {
    if (currentRound) {
      const result = await closeRound(currentRound.id);
      if (result.success) {
        refetch();
      }
    }
  };

  const handleDrawNumbers = async () => {
    if (currentRound) {
      const result = await drawNumbers(currentRound.id);
      if (result.success) {
        refetch();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load lottery</p>
        <p className="text-sm text-theme-text-muted mt-2">
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-text-primary">
          Pado Lottery
        </h1>
        <p className="text-sm text-theme-text-muted mt-1">
          Weekly draw - Pick 5 numbers from 1-32 for a chance to win the jackpot
        </p>
      </div>

      {/* Current Round */}
      {currentRound ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Round Info */}
          <div>
            <LotteryRoundCard
              round={currentRound}
              onCloseRound={handleCloseRound}
              onDrawNumbers={handleDrawNumbers}
              isKeeperLoading={isKeeperLoading}
            />
          </div>

          {/* Ticket Purchase */}
          <div className="bg-theme-bg-secondary rounded-xl p-6">
            <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
              Buy Ticket
            </h2>
            <TicketPurchaseForm round={currentRound} onPurchaseSuccess={refetch} />
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-theme-bg-secondary rounded-xl">
          <p className="text-theme-text-muted">
            No active lottery round
          </p>
          <p className="text-sm text-theme-text-muted mt-2">
            Check back later for the next round
          </p>
        </div>
      )}

      {/* My Tickets */}
      {currentRound && (
        <div className="bg-theme-bg-secondary rounded-xl p-6">
          <MyTicketList roundId={currentRound.id} round={currentRound} />
        </div>
      )}

      {/* How it works */}
      <div className="bg-theme-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-pd2/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-pd3">1</span>
            </div>
            <h3 className="font-medium text-theme-text-primary mb-1">
              Pick Numbers
            </h3>
            <p className="text-sm text-theme-text-secondary">
              Choose 5 numbers from 1-32 or use Quick Pick
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-purple-400">2</span>
            </div>
            <h3 className="font-medium text-theme-text-primary mb-1">
              Buy Ticket
            </h3>
            <p className="text-sm text-theme-text-secondary">
              Each ticket costs 5 NUSDC
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-orange-400">3</span>
            </div>
            <h3 className="font-medium text-theme-text-primary mb-1">
              Wait for Draw
            </h3>
            <p className="text-sm text-theme-text-secondary">
              Drawings happen weekly on Wednesday at 21:00 KST
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-green-700 dark:text-green-400">4</span>
            </div>
            <h3 className="font-medium text-theme-text-primary mb-1">
              Claim Prize
            </h3>
            <p className="text-sm text-theme-text-secondary">
              Match 3+ numbers to win prizes
            </p>
          </div>
        </div>
      </div>

      {/* Past Rounds */}
      {pastRounds.length > 0 && (
        <div className="bg-theme-bg-secondary rounded-xl p-6">
          <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
            Past Rounds
          </h2>
          <div className="space-y-3">
            {pastRounds.slice(0, pastRoundsVisible).map((round) => {
              const isSettled = round.status === ROUND_STATUS.SETTLED;
              const totalWinners = round.tier1Winners + round.tier2Winners + round.tier3Winners;
              const statusLabel = isSettled
                ? 'Settled'
                : ['Open', 'Closed', 'Drawn', 'Settled'][round.status];

              return (
                <Link
                  key={round.id}
                  to={`/games/lottery/${round.id}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-theme-bg-primary hover:bg-theme-bg-tertiary transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-lg font-bold text-theme-text-primary">
                      #{round.roundNumber}
                    </div>
                    <div>
                      <div className="text-sm text-theme-text-secondary">
                        {round.ticketCount.toLocaleString()} ticket{round.ticketCount !== 1 ? 's' : ''}
                        {' / '}
                        {formatNusdc(round.totalSales)} NUSDC
                      </div>
                      {isSettled && round.drawnNumbers && (
                        <div className="flex gap-1.5 mt-1">
                          {round.drawnNumbers.map((num, i) => (
                            <span
                              key={i}
                              className="w-7 h-7 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            >
                              {num}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        isSettled
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <div className="text-sm text-theme-text-secondary mt-1">
                      {isSettled && totalWinners > 0
                        ? `${totalWinners} winner${totalWinners !== 1 ? 's' : ''}`
                        : isSettled
                          ? 'No winners'
                          : ''}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {pastRoundsVisible < pastRounds.length && (
            <button
              onClick={() => setPastRoundsVisible((v) => v + PAST_ROUNDS_PAGE_SIZE)}
              className="w-full mt-4 py-2.5 text-sm font-medium text-pd3 hover:text-pd2 bg-theme-bg-primary hover:bg-theme-bg-tertiary rounded-lg transition-colors"
            >
              Show More ({pastRounds.length - pastRoundsVisible} remaining)
            </button>
          )}
        </div>
      )}

      {/* Prize Distribution */}
      <div className="bg-theme-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
          Prize Distribution
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ticket Sales Breakdown */}
          <div>
            <h3 className="text-sm font-medium text-theme-text-secondary mb-3">
              Ticket Sales
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-theme-text-secondary">Prize Pool</span>
                <span className="text-theme-text-primary font-medium">70%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-theme-text-secondary">Rollover</span>
                <span className="text-theme-text-primary font-medium">20%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-theme-text-secondary">Treasury</span>
                <span className="text-theme-text-primary font-medium">10%</span>
              </div>
            </div>
          </div>

          {/* Prize Pool Breakdown by Tier */}
          <div>
            <h3 className="text-sm font-medium text-theme-text-secondary mb-3">
              Prize Pool by Tier
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-yellow-700 dark:text-yellow-400">Jackpot (5 match)</span>
                <span className="text-theme-text-primary font-medium">60%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-pd1 dark:text-pd3">2nd Prize (4 match)</span>
                <span className="text-theme-text-primary font-medium">25%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700 dark:text-green-400">3rd Prize (3 match)</span>
                <span className="text-theme-text-primary font-medium">15%</span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-theme-text-secondary mt-4">
          If there are no winners in a tier, that share rolls over to the next round.
        </p>
      </div>

    </div>
  );
}
