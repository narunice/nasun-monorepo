/**
 * LotteryAdminPanel
 * Panel content for lottery admin within unified AdminPage
 */

import { useState } from 'react';
import {
  useLotteries,
  useLotteryAdmin,
  formatNusdc,
  ROUND_STATUS,
} from '../index';
import type { LotteryRound } from '../types';
import { useToast } from '../../../components/common/Toast';

const STATUS_CONFIG = {
  [ROUND_STATUS.OPEN]: { label: 'OPEN', color: 'bg-green-500' },
  [ROUND_STATUS.CLOSED]: { label: 'CLOSED', color: 'bg-yellow-500' },
  [ROUND_STATUS.DRAWN]: { label: 'DRAWN', color: 'bg-blue-500' },
  [ROUND_STATUS.SETTLED]: { label: 'SETTLED', color: 'bg-gray-500' },
};

function StatusBadge({ status }: { status: number }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || {
    label: 'UNKNOWN',
    color: 'bg-gray-400',
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium text-white rounded ${config.color}`}
    >
      {config.label}
    </span>
  );
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RoundCardProps {
  round: LotteryRound;
  isLoading: boolean;
  onClose: () => void;
  onDraw: () => void;
  onSettle: (tier1: number, tier2: number, tier3: number) => void;
}

function RoundCard({
  round,
  isLoading,
  onClose,
  onDraw,
  onSettle,
}: RoundCardProps) {
  const [tier1Winners, setTier1Winners] = useState(0);
  const [tier2Winners, setTier2Winners] = useState(0);
  const [tier3Winners, setTier3Winners] = useState(0);
  const now = Date.now();

  const canClose =
    round.status === ROUND_STATUS.OPEN && now >= round.closeTime;
  const canDraw =
    round.status === ROUND_STATUS.CLOSED && now >= round.drawTime;
  const canSettle = round.status === ROUND_STATUS.DRAWN;

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          Round #{round.roundNumber}
        </h3>
        <StatusBadge status={round.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <div className="text-theme-text-secondary">Prize Pool</div>
          <div className="text-theme-text-primary font-medium">
            {formatNusdc(round.prizePool)} NUSDC
          </div>
        </div>
        <div>
          <div className="text-theme-text-secondary">Tickets Sold</div>
          <div className="text-theme-text-primary font-medium">
            {round.ticketCount}
          </div>
        </div>
        <div>
          <div className="text-theme-text-secondary">Close Time</div>
          <div className="text-theme-text-primary font-medium">
            {formatDateTime(round.closeTime)}
          </div>
        </div>
        <div>
          <div className="text-theme-text-secondary">Draw Time</div>
          <div className="text-theme-text-primary font-medium">
            {formatDateTime(round.drawTime)}
          </div>
        </div>
      </div>

      {round.drawnNumbers && (
        <div className="mb-4">
          <div className="text-theme-text-secondary text-sm mb-2">
            Drawn Numbers
          </div>
          <div className="flex gap-2">
            {round.drawnNumbers.map((num, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-theme-accent text-white flex items-center justify-center font-medium"
              >
                {num}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {canClose && (
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Close Round'}
          </button>
        )}

        {canDraw && (
          <button
            onClick={onDraw}
            disabled={isLoading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Draw Numbers'}
          </button>
        )}

        {canSettle && (
          <div className="space-y-3">
            <div className="text-theme-text-secondary text-sm font-medium">
              Enter Winner Counts by Tier
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-yellow-400 mb-1">
                  Tier 1 (5 match)
                </label>
                <input
                  type="number"
                  min="0"
                  value={tier1Winners}
                  onChange={(e) =>
                    setTier1Winners(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-full px-2 py-1 bg-theme-bg-tertiary border border-yellow-500/30 rounded text-theme-text-primary text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-blue-400 mb-1">
                  Tier 2 (4 match)
                </label>
                <input
                  type="number"
                  min="0"
                  value={tier2Winners}
                  onChange={(e) =>
                    setTier2Winners(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-full px-2 py-1 bg-theme-bg-tertiary border border-blue-500/30 rounded text-theme-text-primary text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-green-400 mb-1">
                  Tier 3 (3 match)
                </label>
                <input
                  type="number"
                  min="0"
                  value={tier3Winners}
                  onChange={(e) =>
                    setTier3Winners(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-full px-2 py-1 bg-theme-bg-tertiary border border-green-500/30 rounded text-theme-text-primary text-center"
                />
              </div>
            </div>
            <button
              onClick={() => onSettle(tier1Winners, tier2Winners, tier3Winners)}
              disabled={isLoading}
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Processing...' : 'Settle Round'}
            </button>
          </div>
        )}

        {round.status === ROUND_STATUS.SETTLED && (
          <div className="text-center text-theme-text-secondary text-sm py-2">
            Round completed
          </div>
        )}

        {round.status === ROUND_STATUS.OPEN && now < round.closeTime && (
          <div className="text-center text-theme-text-secondary text-sm py-2">
            Waiting for close time...
          </div>
        )}

        {round.status === ROUND_STATUS.CLOSED && now < round.drawTime && (
          <div className="text-center text-theme-text-secondary text-sm py-2">
            Waiting for draw time...
          </div>
        )}
      </div>
    </div>
  );
}

interface CreateRoundFormProps {
  onSubmit: (
    closeTime: number,
    drawTime: number,
    rollover: bigint
  ) => Promise<void>;
  isLoading: boolean;
}

function CreateRoundForm({ onSubmit, isLoading }: CreateRoundFormProps) {
  const [closeDate, setCloseDate] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [drawTime, setDrawTime] = useState('');
  const [rollover, setRollover] = useState('0');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = () => {
    setValidationError(null);

    if (!closeDate || !closeTime || !drawDate || !drawTime) {
      setValidationError('Please fill in all date/time fields');
      return;
    }

    const closeTimestamp = new Date(`${closeDate}T${closeTime}`).getTime();
    const drawTimestamp = new Date(`${drawDate}T${drawTime}`).getTime();
    const now = Date.now();

    if (closeTimestamp <= now) {
      setValidationError('Close time must be in the future');
      return;
    }

    if (drawTimestamp <= closeTimestamp) {
      setValidationError('Draw time must be after close time');
      return;
    }

    const rolloverAmount = BigInt(
      Math.floor(parseFloat(rollover || '0') * 1_000_000)
    );

    onSubmit(closeTimestamp, drawTimestamp, rolloverAmount);
  };

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
        Create New Round
      </h3>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">
              Close Date
            </label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">
              Close Time
            </label>
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">
              Draw Date
            </label>
            <input
              type="date"
              value={drawDate}
              onChange={(e) => setDrawDate(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">
              Draw Time
            </label>
            <input
              type="time"
              value={drawTime}
              onChange={(e) => setDrawTime(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-theme-text-secondary mb-1">
            Rollover Amount (NUSDC)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rollover}
            onChange={(e) => setRollover(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
          />
          <div className="text-xs text-theme-text-secondary mt-1">
            Amount to carry over from previous rounds
          </div>
        </div>

        {validationError && (
          <div className="text-red-500 text-sm">{validationError}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full py-2 bg-theme-accent hover:opacity-90 text-white rounded-lg font-medium disabled:opacity-50 transition-opacity"
        >
          {isLoading ? 'Creating...' : 'Create Round'}
        </button>
      </div>
    </div>
  );
}

export function LotteryAdminPanel() {
  const { showToast } = useToast();

  const { rounds, registry, refetch } = useLotteries();
  const {
    isLoading,
    error,
    createRound,
    closeRound,
    drawNumbers,
    settleRound,
    withdrawTreasury,
  } = useLotteryAdmin();

  // Find most recent round for management
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
            <h3 className="text-lg font-semibold text-theme-text-primary">
              Treasury
            </h3>
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
          <h2 className="text-lg font-semibold text-theme-text-primary mb-3">
            Current Round
          </h2>
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
          <h2 className="text-lg font-semibold text-theme-text-primary mb-3">
            All Rounds
          </h2>
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
                  {round.ticketCount} tickets | {formatNusdc(round.prizePool)}{' '}
                  NUSDC
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-sm font-semibold text-theme-text-primary mb-2">
          Admin Actions Guide
        </h3>
        <ul className="text-sm text-theme-text-muted space-y-1">
          <li>
            <strong>Close Round:</strong> Stops ticket sales after close time
          </li>
          <li>
            <strong>Draw Numbers:</strong> Generates winning numbers using Sui
            Random
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
