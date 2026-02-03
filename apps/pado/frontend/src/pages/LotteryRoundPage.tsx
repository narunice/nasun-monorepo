/**
 * LotteryRoundPage
 * Lottery round detail with tickets and results
 */

import { useParams, Link } from 'react-router-dom';
import {
  useLotteryRound,
  useLotteryKeeper,
  LotteryRoundCard,
  TicketPurchaseForm,
  MyTicketList,
  ROUND_STATUS,
  formatNusdc,
} from '../features/lottery';
import { Spinner } from '../components/common';

export function LotteryRoundPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { round, isLoading, error, refetch } = useLotteryRound(roundId || '');
  const { closeRound, drawNumbers, isLoading: isKeeperLoading } = useLotteryKeeper();

  const handleCloseRound = async () => {
    if (roundId) {
      const result = await closeRound(roundId);
      if (result.success) {
        refetch();
      }
    }
  };

  const handleDrawNumbers = async () => {
    if (roundId) {
      const result = await drawNumbers(roundId);
      if (result.success) {
        refetch();
      }
    }
  };

  if (!roundId) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Invalid round ID</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !round) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load round</p>
        <Link
          to="/lottery"
          className="text-pd3 hover:text-pd3 mt-4 inline-block"
        >
          &larr; Back to Lottery
        </Link>
      </div>
    );
  }

  const isOpen = round.status === ROUND_STATUS.OPEN;
  const isDrawn = round.status === ROUND_STATUS.DRAWN;
  const isSettled = round.status === ROUND_STATUS.SETTLED;

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to="/lottery"
        className="text-pd3 hover:text-pd3 inline-flex items-center gap-1"
      >
        &larr; Back to Lottery
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-text-primary">
          Round #{round.roundNumber}
        </h1>
        <p className="text-sm text-theme-text-muted mt-1">
          {isOpen && 'Ticket sales are open'}
          {round.status === ROUND_STATUS.CLOSED && 'Sales closed, awaiting draw'}
          {isDrawn && 'Numbers drawn, awaiting settlement'}
          {isSettled && 'Round completed'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Round Info & Purchase */}
        <div className="space-y-6">
          <LotteryRoundCard
            round={round}
            onCloseRound={handleCloseRound}
            onDrawNumbers={handleDrawNumbers}
            isKeeperLoading={isKeeperLoading}
          />

          {isOpen && (
            <div className="bg-theme-bg-secondary rounded-xl p-6">
              <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
                Buy Ticket
              </h2>
              <TicketPurchaseForm round={round} onPurchaseSuccess={refetch} />
            </div>
          )}

          {(isDrawn || isSettled) && round.drawnNumbers && (
            <div className="bg-theme-bg-secondary rounded-xl p-6">
              <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
                Winning Numbers
              </h2>
              <div className="flex gap-3 justify-center">
                {round.drawnNumbers.map((num, i) => (
                  <div
                    key={i}
                    className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center font-bold text-2xl text-white shadow-lg"
                  >
                    {num}
                  </div>
                ))}
              </div>

              {/* Multi-tier winner summary */}
              {isSettled && (
                <div className="mt-4 space-y-2 text-center">
                  {round.tier1Winners > 0 && (
                    <p className="text-yellow-400 font-medium">
                      {Number(round.tier1Winners)} Jackpot winner{round.tier1Winners !== 1 ? 's' : ''}!
                    </p>
                  )}
                  {round.tier2Winners > 0 && (
                    <p className="text-pd3">
                      {Number(round.tier2Winners)} 2nd prize winner{round.tier2Winners !== 1 ? 's' : ''}
                    </p>
                  )}
                  {round.tier3Winners > 0 && (
                    <p className="text-green-400">
                      {Number(round.tier3Winners)} 3rd prize winner{round.tier3Winners !== 1 ? 's' : ''}
                    </p>
                  )}
                  {round.tier1Winners === 0 && round.tier2Winners === 0 && round.tier3Winners === 0 && (
                    <p className="text-theme-text-secondary">
                      No winners this round. Prize rolled over.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column - My Tickets */}
        <div className="bg-theme-bg-secondary rounded-xl p-6">
          <MyTicketList roundId={roundId} round={round} />
        </div>
      </div>

      {/* Round Stats */}
      {isSettled && (
        <div className="bg-theme-bg-secondary rounded-xl p-6">
          <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
            Round Statistics
          </h2>

          {/* Basic Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-sm text-theme-text-secondary">
                Total Tickets
              </div>
              <div className="text-xl font-bold text-theme-text-primary">
                {round.ticketCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-theme-text-secondary">
                Total Sales
              </div>
              <div className="text-xl font-bold text-theme-text-primary">
                {formatNusdc(round.totalSales)} NUSDC
              </div>
            </div>
            <div>
              <div className="text-sm text-theme-text-secondary">
                Prize Pool
              </div>
              <div className="text-xl font-bold text-theme-text-primary">
                {formatNusdc(round.prizePool + round.rolloverIn)} NUSDC
              </div>
            </div>
            <div>
              <div className="text-sm text-theme-text-secondary">
                Total Winners
              </div>
              <div className="text-xl font-bold text-theme-text-primary">
                {Number(round.tier1Winners + round.tier2Winners + round.tier3Winners)}
              </div>
            </div>
          </div>

          {/* Tier Breakdown */}
          <h3 className="text-sm font-medium text-theme-text-secondary mb-3">
            Prize Breakdown by Tier
          </h3>
          <div className="space-y-3">
            {/* Tier 1 - Jackpot */}
            <div className="flex items-center justify-between p-3 bg-yellow-900/10 rounded-lg border border-yellow-900/20">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-900/30 text-yellow-400">
                  Jackpot
                </span>
                <span className="text-theme-text-secondary">5 matches</span>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 font-medium">
                  {Number(round.tier1Winners)} winner{round.tier1Winners !== 1 ? 's' : ''}
                </div>
                {round.tier1Winners > 0 && (
                  <div className="text-sm text-theme-text-secondary">
                    {formatNusdc(round.tier1PayoutPerWinner)} NUSDC each
                  </div>
                )}
              </div>
            </div>

            {/* Tier 2 - 2nd Prize */}
            <div className="flex items-center justify-between p-3 bg-pd0/10 rounded-lg border border-pd0/20">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded text-xs font-medium bg-pd0/30 text-pd3">
                  2nd Prize
                </span>
                <span className="text-theme-text-secondary">4 matches</span>
              </div>
              <div className="text-right">
                <div className="text-pd3 font-medium">
                  {Number(round.tier2Winners)} winner{round.tier2Winners !== 1 ? 's' : ''}
                </div>
                {round.tier2Winners > 0 && (
                  <div className="text-sm text-theme-text-secondary">
                    {formatNusdc(round.tier2PayoutPerWinner)} NUSDC each
                  </div>
                )}
              </div>
            </div>

            {/* Tier 3 - 3rd Prize */}
            <div className="flex items-center justify-between p-3 bg-green-900/10 rounded-lg border border-green-900/20">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded text-xs font-medium bg-green-900/30 text-green-400">
                  3rd Prize
                </span>
                <span className="text-theme-text-secondary">3 matches</span>
              </div>
              <div className="text-right">
                <div className="text-green-400 font-medium">
                  {Number(round.tier3Winners)} winner{round.tier3Winners !== 1 ? 's' : ''}
                </div>
                {round.tier3Winners > 0 && (
                  <div className="text-sm text-theme-text-secondary">
                    {formatNusdc(round.tier3PayoutPerWinner)} NUSDC each
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
