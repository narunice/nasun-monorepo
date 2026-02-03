/**
 * LotteryAdminContent
 * Shared admin content used by both LotteryAdminPage and LotteryAdminPanel
 */

import { useLotteries, useLotteryAdmin, formatNusdc, ROUND_STATUS } from '../../index';
import { useToast } from '@/components/common/Toast';
import { RoundCard } from './RoundCard';
import { CreateRoundForm } from './CreateRoundForm';
import { StatusBadge } from './StatusBadge';

export function LotteryAdminContent() {
  const { showToast } = useToast();
  const { rounds, registry, refetch } = useLotteries();
  const { isLoading, error, createRound, closeRound, drawNumbers, settleRound, withdrawTreasury } =
    useLotteryAdmin();

  const latestRound = rounds.length > 0 ? rounds[0] : null;

  const handleCreateRound = async (
    closeTimeMs: number,
    drawTimeMs: number,
    rolloverAmount: bigint
  ) => {
    const result = await createRound(closeTimeMs, drawTimeMs, rolloverAmount);
    if (result.success) {
      showToast('Round created successfully!', 'success');
      refetch();
    } else {
      showToast(result.error || 'Failed to create round', 'error');
    }
  };

  const handleCloseRound = async (roundId: string) => {
    const result = await closeRound(roundId);
    if (result.success) {
      showToast('Round closed successfully!', 'success');
      refetch();
    } else {
      showToast(result.error || 'Failed to close round', 'error');
    }
  };

  const handleDrawNumbers = async (roundId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to draw the winning numbers? This action cannot be undone.'
    );
    if (!confirmed) return;

    const result = await drawNumbers(roundId);
    if (result.success) {
      showToast('Numbers drawn successfully!', 'success');
      refetch();
    } else {
      showToast(result.error || 'Failed to draw numbers', 'error');
    }
  };

  const handleSettleRound = async (
    roundId: string,
    tier1: number,
    tier2: number,
    tier3: number
  ) => {
    const totalWinners = tier1 + tier2 + tier3;
    const confirmed = window.confirm(
      `Are you sure you want to settle this round?\n\n` +
        `Tier 1 (Jackpot): ${tier1} winner(s)\n` +
        `Tier 2 (4 match): ${tier2} winner(s)\n` +
        `Tier 3 (3 match): ${tier3} winner(s)\n` +
        `Total: ${totalWinners} winner(s)`
    );
    if (!confirmed) return;

    const result = await settleRound(roundId, tier1, tier2, tier3);
    if (result.success) {
      showToast('Round settled successfully!', 'success');
      refetch();
    } else {
      showToast(result.error || 'Failed to settle round', 'error');
    }
  };

  const handleWithdrawTreasury = async () => {
    if (!registry || registry.treasuryBalance <= 0n) {
      showToast('No treasury balance to withdraw', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Withdraw ${formatNusdc(registry.treasuryBalance)} NUSDC from treasury?`
    );
    if (!confirmed) return;

    const result = await withdrawTreasury();
    if (result.success) {
      showToast('Treasury withdrawn successfully!', 'success');
      refetch();
    } else {
      showToast(result.error || 'Failed to withdraw treasury', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Treasury Section */}
      <div className="bg-theme-bg-secondary rounded-xl p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-theme-text-primary">Treasury</h3>
            <div className="text-2xl font-bold text-theme-accent mt-1">
              {registry ? formatNusdc(registry.treasuryBalance) : '0.00'} NUSDC
            </div>
          </div>
          <button
            onClick={handleWithdrawTreasury}
            disabled={isLoading || !registry || registry.treasuryBalance <= 0n}
            className="px-4 py-2 bg-theme-accent hover:opacity-90 text-white rounded-lg font-medium disabled:opacity-50 transition-opacity"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Current Round Management */}
      {latestRound && latestRound.status !== ROUND_STATUS.SETTLED && (
        <div>
          <h2 className="text-lg font-semibold text-theme-text-primary mb-3">Current Round</h2>
          <RoundCard
            round={latestRound}
            isLoading={isLoading}
            onClose={() => handleCloseRound(latestRound.id)}
            onDraw={() => handleDrawNumbers(latestRound.id)}
            onSettle={(tier1, tier2, tier3) =>
              handleSettleRound(latestRound.id, tier1, tier2, tier3)
            }
          />
        </div>
      )}

      {/* Create New Round */}
      <CreateRoundForm onSubmit={handleCreateRound} isLoading={isLoading} />

      {/* Past Rounds List */}
      {rounds.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-theme-text-primary mb-3">All Rounds</h2>
          <div className="space-y-3">
            {rounds.map((round) => (
              <div
                key={round.id}
                className="bg-theme-bg-secondary rounded-lg p-4 flex justify-between items-center"
              >
                <div className="flex items-center gap-4">
                  <span className="text-theme-text-primary font-medium">
                    Round #{round.roundNumber}
                  </span>
                  <StatusBadge status={round.status} />
                </div>
                <div className="text-theme-text-secondary text-sm">
                  {round.ticketCount} tickets | {formatNusdc(round.prizePool)} NUSDC
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-sm font-semibold text-theme-text-primary mb-2">Admin Actions Guide</h3>
        <ul className="text-sm text-theme-text-muted space-y-1">
          <li>
            <strong>Close Round:</strong> Stops ticket sales after close time
          </li>
          <li>
            <strong>Draw Numbers:</strong> Generates winning numbers using Sui Random
          </li>
          <li>
            <strong>Settle Round:</strong> Distributes prizes and moves rollover
          </li>
          <li>
            <strong>Withdraw Treasury:</strong> Claims accumulated 10% fees
          </li>
        </ul>
      </div>
    </div>
  );
}
