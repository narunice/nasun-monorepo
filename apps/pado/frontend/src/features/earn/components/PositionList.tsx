/**
 * PositionList Component
 * Displays user's lending positions with withdraw option
 */

import { useState, useCallback } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useLendingPositions } from '../hooks/useLendingPositions';
import { useLendingPool } from '../hooks/useLendingPool';
import { useLendingActions } from '../hooks/useLendingActions';
import { formatNUSDC, type PositionValue } from '../types/lending';
import { NETWORK_CONFIG } from '../../../config/network';
import { getExplorerObjectUrl } from '@/lib/explorer';

export function PositionList() {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { positions, totalDeposited, totalEarned, isLoading, refetch } = useLendingPositions();
  const { refetch: refetchPool } = useLendingPool();
  const { withdraw, isLoading: isWithdrawing, error } = useLendingActions();

  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleWithdraw = useCallback(async (positionId: string) => {
    setWithdrawingId(positionId);
    setSuccess(null);

    try {
      const digest = await withdraw(positionId);
      setSuccess(digest);

      // Refetch pool and positions after delay
      setTimeout(() => {
        refetchPool();
        refetch();
      }, 1500);
    } catch {
      // Error handled by hook
    } finally {
      setWithdrawingId(null);
    }
  }, [withdraw, refetchPool, refetch]);

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = (status === 'unlocked' && account) || isZkConnected || isPasskeyUnlocked;

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-theme-text-secondary mb-4">
          Your Positions
        </h3>
        <p className="text-sm text-theme-text-muted text-center py-4">
          Connect your wallet to view positions
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-theme-text-secondary mb-4">
          Your Positions
        </h3>
        <div className="animate-pulse space-y-2">
          <div className="h-16 bg-theme-bg-tertiary rounded" />
          <div className="h-16 bg-theme-bg-tertiary rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-theme-text-secondary mb-4">
        Your Positions
      </h3>

      {positions.length === 0 ? (
        <div className="text-center py-6">
          <svg
            className="w-12 h-12 mx-auto text-theme-text-muted mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-theme-text-muted">No active deposits</p>
          <p className="text-xs text-theme-text-muted mt-1">
            Deposit NUSDC to start earning
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-theme-bg-secondary/50 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-theme-text-muted">Total Deposited</p>
                <p className="text-lg font-medium text-theme-text-primary">
                  ${formatNUSDC(totalDeposited)}
                </p>
              </div>
              <div>
                <p className="text-xs text-theme-text-muted">Total Earned</p>
                <p className="text-lg font-medium text-green-600 dark:text-green-400">
                  +${formatNUSDC(totalEarned)}
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-100 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30 rounded-lg p-3">
              <p className="text-sm text-green-600 dark:text-green-400">
                Withdrawal successful!
              </p>
              <a
                href={`${NETWORK_CONFIG.explorerUrl}/tx/${success}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-pd3 hover:underline"
              >
                View transaction →
              </a>
            </div>
          )}

          {/* Position Cards */}
          <div className="space-y-2">
            {positions.map((pv) => (
              <PositionCard
                key={pv.position.id}
                positionValue={pv}
                onWithdraw={handleWithdraw}
                isWithdrawing={withdrawingId === pv.position.id}
                disabled={isWithdrawing}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PositionCardProps {
  positionValue: PositionValue;
  onWithdraw: (positionId: string) => void;
  isWithdrawing: boolean;
  disabled: boolean;
}

function PositionCard({
  positionValue,
  onWithdraw,
  isWithdrawing,
  disabled,
}: PositionCardProps) {
  const { position, currentValue, earnedInterest } = positionValue;

  return (
    <div className="bg-theme-bg-secondary/50 rounded-lg p-3 border border-theme-border">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-theme-text-primary">
              ${formatNUSDC(currentValue)}
            </span>
            {earnedInterest > 0n && (
              <span className="text-xs text-green-600 dark:text-green-400">
                (+${formatNUSDC(earnedInterest)})
              </span>
            )}
            <a
              href={getExplorerObjectUrl(position.id)}
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
          </div>
          <p className="text-xs text-theme-text-muted mt-0.5">
            Deposited: {new Date(Number(position.createdAt)).toLocaleDateString()}
          </p>
        </div>

        <button
          onClick={() => onWithdraw(position.id)}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-theme-bg-tertiary hover:bg-theme-bg-secondary disabled:opacity-50 text-theme-text-primary rounded transition-colors"
        >
          {isWithdrawing ? (
            <span className="flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Withdrawing...
            </span>
          ) : (
            'Withdraw'
          )}
        </button>
      </div>
    </div>
  );
}
