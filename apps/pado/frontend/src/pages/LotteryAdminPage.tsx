/**
 * LotteryAdminPage
 * Admin page for managing lottery rounds
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet, useZkLogin } from '@nasun/wallet';
import {
  useLotteries,
  useLotteryAdmin,
  formatNusdc,
  ROUND_STATUS,
} from '../features/lottery';
import type { LotteryRound } from '../features/lottery';
import { useToast } from '../components/common/Toast';

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
  onSettle: () => void;
}

function RoundCard({
  round,
  isLoading,
  onClose,
  onDraw,
  onSettle,
}: RoundCardProps) {
  const [winnersCount, setWinnersCount] = useState(0);
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-theme-text-secondary text-sm">
                Jackpot Winners:
              </label>
              <input
                type="number"
                min="0"
                value={winnersCount}
                onChange={(e) =>
                  setWinnersCount(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="w-20 px-2 py-1 bg-theme-bg-tertiary border border-theme-border rounded text-theme-text-primary"
              />
            </div>
            <button
              onClick={() => onSettle()}
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

export function LotteryAdminPage() {
  const { account } = useWallet();
  const { state: zkState } = useZkLogin();
  const { showToast } = useToast();

  const { rounds, registry, refetch } = useLotteries();
  const {
    isAdmin,
    isLoading,
    error,
    createRound,
    closeRound,
    drawNumbers,
    settleRound,
    withdrawTreasury,
  } = useLotteryAdmin();

  // Get current wallet address
  const walletAddress = account?.address || zkState?.address;

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

  const handleSettleRound = async (roundId: string, winnersCount: number) => {
    const confirmed = window.confirm(
      `Are you sure you want to settle this round with ${winnersCount} jackpot winner(s)?`
    );
    if (!confirmed) return;

    const result = await settleRound(roundId, winnersCount);
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

  // Not authorized
  if (!walletAddress) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-theme-text-primary mb-2">
            Wallet Not Connected
          </h2>
          <p className="text-theme-text-muted mb-4">
            Please connect your wallet to access the admin panel.
          </p>
          <Link
            to="/lottery"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to Lottery
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <div className="text-red-500 text-5xl mb-4">X</div>
          <h2 className="text-xl font-bold text-theme-text-primary mb-2">
            Access Denied
          </h2>
          <p className="text-theme-text-muted mb-4">
            You don't have permission to manage lottery rounds. Only admins with
            AdminCap can access this page.
          </p>
          <Link
            to="/lottery"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to Lottery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <Link
        to="/lottery"
        className="inline-flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Lottery
      </Link>

      {/* Admin Badge */}
      <div className="flex items-center gap-2 text-yellow-500">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">Admin Mode</span>
      </div>

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
            onSettle={() =>
              handleSettleRound(latestRound.id, latestRound.jackpotWinners || 0)
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
