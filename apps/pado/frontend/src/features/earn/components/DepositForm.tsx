/**
 * DepositForm Component
 * Form for depositing NUSDC into the lending pool
 */

import { useState, useCallback } from 'react';
import { useWallet, useMultiBalance, useZkLogin } from '@nasun/wallet';
import { useLendingActions } from '../hooks/useLendingActions';
import { useLendingPool } from '../hooks/useLendingPool';
import { useLendingPositions } from '../hooks/useLendingPositions';
import { parseNUSDC, MIN_DEPOSIT, formatPercentage } from '../types/lending';
import { NETWORK_CONFIG } from '../../../config/network';

interface DepositFormProps {
  onSuccess?: (digest: string) => void;
}

export function DepositForm({ onSuccess }: DepositFormProps) {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { data: balances } = useMultiBalance();
  const { stats, refetch: refetchPool } = useLendingPool();
  const { refetch: refetchPositions } = useLendingPositions();
  const { deposit, isLoading, error, clearError } = useLendingActions();

  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  // Get NUSDC balance
  const nusdcBalance = balances?.tokens?.NUSDC?.balance ?? 0n;
  const formattedBalance = (Number(nusdcBalance) / 1_000_000).toFixed(2);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers and decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value);
      clearError();
      setSuccess(null);
    }
  };

  const handleMaxClick = () => {
    setAmount(formattedBalance);
  };

  const handleDeposit = useCallback(async () => {
    if (!amount) return;

    const amountBigInt = parseNUSDC(amount);
    if (amountBigInt < MIN_DEPOSIT) {
      return;
    }

    try {
      const digest = await deposit(amountBigInt);
      setSuccess(digest);
      setAmount('');

      // Refetch pool and positions after delay
      setTimeout(() => {
        refetchPool();
        refetchPositions();
      }, 1500);

      onSuccess?.(digest);
    } catch {
      // Error is handled by the hook
    }
  }, [amount, deposit, refetchPool, refetchPositions, onSuccess]);

  const parsedAmount = parseNUSDC(amount);
  const isValidAmount = parsedAmount >= MIN_DEPOSIT && parsedAmount <= nusdcBalance;
  const isConnected = (status === 'unlocked' && account) || isZkConnected;

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-theme-text-secondary mb-4">
        Deposit NUSDC
      </h3>

      {!isConnected ? (
        <div className="text-center py-6">
          <p className="text-sm text-theme-text-muted">
            Connect your wallet to deposit
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Amount Input */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-theme-text-muted">Amount</span>
              <span className="text-theme-text-muted">
                Balance: {formattedBalance} NUSDC
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                className="w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg px-3 py-2 pr-16 text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleMaxClick}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-400"
              >
                MAX
              </button>
            </div>
            {amount && parsedAmount < MIN_DEPOSIT && (
              <p className="text-xs text-red-500 mt-1">
                Min deposit: 1 NUSDC
              </p>
            )}
          </div>

          {/* Estimated Earnings */}
          {stats && amount && isValidAmount && (
            <div className="bg-gray-100 dark:bg-zinc-800/50 rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-theme-text-muted">Est. Annual Yield</span>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  +${(parseFloat(amount) * stats.supplyAPY).toFixed(2)} NUSDC
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-theme-text-muted">Current APY</span>
                <span className="text-theme-text-secondary">
                  {formatPercentage(stats.supplyAPY)}
                </span>
              </div>
            </div>
          )}

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
                Deposit successful!
              </p>
              <a
                href={`${NETWORK_CONFIG.explorerUrl}/tx/${success}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                View transaction →
              </a>
            </div>
          )}

          {/* Deposit Button */}
          <button
            onClick={handleDeposit}
            disabled={!isValidAmount || isLoading}
            className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Depositing...
              </span>
            ) : (
              'Deposit'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
