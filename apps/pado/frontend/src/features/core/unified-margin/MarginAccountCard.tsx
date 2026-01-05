/**
 * MarginAccountCard
 *
 * UI component for Unified Margin account management
 * Shows balance, deposit/withdraw actions
 *
 * @version 0.1.0
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet, useMultiBalance, getSuiClient } from '@nasun/wallet';
import { useMarginAccount } from './useMarginAccount';
import { TOKENS } from '../../../config/network';

// Format NUSDC amount (6 decimals)
function formatNusdc(amount: bigint | undefined): string {
  if (!amount) return '0.00';
  const value = Number(amount) / 1e6;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function MarginAccountCard() {
  const { status, account: walletAccount } = useWallet();
  const { data: balances } = useMultiBalance();

  // Query NUSDC coin object
  const { data: nusdcCoin } = useQuery({
    queryKey: ['nusdc-coin', walletAccount?.address],
    queryFn: async () => {
      if (!walletAccount?.address) return null;
      const client = getSuiClient();
      const coins = await client.getCoins({
        owner: walletAccount.address,
        coinType: TOKENS.NUSDC.type,
      });
      return coins.data[0] || null;
    },
    enabled: !!walletAccount?.address,
    staleTime: 5000,
  });

  const {
    account,
    hasAccount,
    createAccount,
    deposit,
    withdraw,
    isCreating,
    isDepositing,
    isWithdrawing,
    isLoading,
  } = useMarginAccount();

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isConnected = status === 'unlocked' && walletAccount;

  // Get NUSDC wallet balance
  const nusdcBalance = balances?.tokens?.NUSDC;
  const walletNusdcAmount = nusdcBalance ? Number(nusdcBalance.balance) / 1e6 : 0;

  // Handle deposit
  const handleDeposit = async () => {
    setError(null);
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Find NUSDC coin ID
    if (!nusdcCoin?.coinObjectId) {
      setError('No NUSDC coins found in wallet');
      return;
    }

    try {
      await deposit(nusdcCoin.coinObjectId, BigInt(Math.round(amount * 1e6)));
      setShowDepositModal(false);
      setDepositAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    setError(null);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const marginBalance = Number(account?.nusdcBalance || 0n) / 1e6;
    if (amount > marginBalance) {
      setError('Insufficient margin balance');
      return;
    }

    try {
      await withdraw(BigInt(Math.round(amount * 1e6)));
      setShowWithdrawModal(false);
      setWithdrawAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdraw failed');
    }
  };

  // Not connected
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to manage Unified Margin
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-theme-bg-tertiary rounded w-1/3 mb-2"></div>
          <div className="h-8 bg-theme-bg-tertiary rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  // No account - show create button
  if (!hasAccount) {
    return (
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-theme-text-primary">
              Unified Margin
            </h3>
            <p className="text-sm text-theme-text-secondary mt-1">
              Create a margin account to access all trading features
            </p>
          </div>
          <button
            onClick={() => createAccount()}
            disabled={isCreating}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </div>
    );
  }

  // Has account - show balance and actions
  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-theme-text-primary">Unified Margin</h3>
        <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
          Active
        </span>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <div className="text-sm text-theme-text-secondary mb-1">
          Available Balance
        </div>
        <div className="text-2xl font-bold text-theme-text-primary">
          {formatNusdc(account?.nusdcBalance)} <span className="text-base font-normal text-theme-text-secondary">NUSDC</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <div className="text-theme-text-muted">Total Deposited</div>
          <div className="text-theme-text-primary font-medium">
            {formatNusdc(account?.totalDeposited)} NUSDC
          </div>
        </div>
        <div>
          <div className="text-theme-text-muted">Total Withdrawn</div>
          <div className="text-theme-text-primary font-medium">
            {formatNusdc(account?.totalWithdrawn)} NUSDC
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowDepositModal(true)}
          className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
        >
          Deposit
        </button>
        <button
          onClick={() => setShowWithdrawModal(true)}
          disabled={!account?.nusdcBalance || account.nusdcBalance === 0n}
          className="flex-1 py-2 bg-theme-bg-tertiary hover:bg-theme-bg-primary text-theme-text-primary font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
              Deposit NUSDC
            </h3>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-theme-text-secondary">Amount</span>
                <span className="text-theme-text-muted">
                  Wallet: {walletNusdcAmount.toFixed(2)} NUSDC
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder:text-theme-text-muted"
                />
                <button
                  onClick={() => setDepositAmount(walletNusdcAmount.toString())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-400"
                >
                  MAX
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-4">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDepositModal(false);
                  setError(null);
                }}
                className="flex-1 py-2 bg-theme-bg-tertiary text-theme-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isDepositing ? 'Depositing...' : 'Confirm Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
              Withdraw NUSDC
            </h3>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-theme-text-secondary">Amount</span>
                <span className="text-theme-text-muted">
                  Available: {formatNusdc(account?.nusdcBalance)} NUSDC
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder:text-theme-text-muted"
                />
                <button
                  onClick={() =>
                    setWithdrawAmount(
                      (Number(account?.nusdcBalance || 0n) / 1e6).toString()
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-400"
                >
                  MAX
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-4">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setError(null);
                }}
                className="flex-1 py-2 bg-theme-bg-tertiary text-theme-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawing}
                className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isWithdrawing ? 'Withdrawing...' : 'Confirm Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
