/**
 * SmartAccountPanel
 *
 * Unified account management UI for Phase 16.5
 * Shows:
 * - Total equity with risk indicator
 * - Collateral breakdown with haircuts
 * - Free collateral
 * - Deposit/Withdraw actions for multiple tokens
 *
 * @version 1.0.0 (Phase 16.5)
 */

import { useState } from 'react';
import { useSmartAccount, formatUsd, getRiskLevelLabel, getRiskLevelColor } from './useSmartAccount';
import { useMarginAccount } from './useMarginAccount';
import { useToast } from '../../../components/common';
import { TOKENS } from '../../../config/network';

type CollateralToken = 'NUSDC' | 'NBTC';

export function SmartAccountPanel() {
  const {
    authType,
    isConnected,
    totalEquity,
    freeCollateral,
    marginRatio,
    riskLevel,
    collateral,
    totalCollateralValue,
    isPadoEnabled,
    isLoading,
    refetch,
  } = useSmartAccount();

  const {
    createAccount,
    withdraw,
    isCreating,
    isDepositing,
    isWithdrawing,
  } = useMarginAccount();

  const { showToast } = useToast();

  // Modal states
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<CollateralToken>('NUSDC');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Handle enable Pado
  const handleEnablePado = async () => {
    try {
      await createAccount();
      showToast('Pado enabled successfully!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to enable Pado', 'error');
    }
  };

  // Handle deposit
  const handleDeposit = async () => {
    setError(null);
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      // TODO: Get coin ID for selected token
      // For now, only NUSDC is implemented
      if (selectedToken === 'NUSDC') {
        // This requires a coin ID - we need to fetch it
        showToast('Deposit initiated. Use the detailed Deposit button for now.', 'info');
        setShowDepositModal(false);
        setAmount('');
      } else {
        showToast('NBTC deposit coming soon', 'info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    setError(null);
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      const decimals = TOKENS[selectedToken].decimals;
      await withdraw(BigInt(Math.round(amountNum * 10 ** decimals)));
      showToast(`Withdrew ${amountNum} ${selectedToken}`, 'success');
      setShowWithdrawModal(false);
      setAmount('');
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdraw failed');
    }
  };

  // Not connected
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6">
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to manage your Smart Account
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-theme-bg-tertiary rounded w-1/3"></div>
          <div className="h-8 bg-theme-bg-tertiary rounded w-1/2"></div>
          <div className="h-4 bg-theme-bg-tertiary rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  // Not enabled
  if (!isPadoEnabled) {
    return (
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-theme-text-primary">
              Enable Smart Account
            </h3>
            <p className="text-sm text-theme-text-secondary mt-1">
              Enable your Smart Account to use unified collateral across Trading, Predictions, and more
            </p>
          </div>
          <button
            onClick={handleEnablePado}
            disabled={isCreating}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isCreating ? 'Enabling...' : 'Enable Now'}
          </button>
        </div>
      </div>
    );
  }

  // Enabled - show full panel
  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-theme-text-primary">
            Smart Account
          </h3>
          <p className="text-xs text-theme-text-muted mt-0.5">
            {authType === 'zkLogin' ? 'Social Login' : 'Embedded Wallet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getRiskLevelColor(riskLevel)}`}>
            {getRiskLevelLabel(riskLevel)}
          </span>
          <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
            Active
          </span>
        </div>
      </div>

      {/* Total Equity */}
      <div className="bg-theme-bg-primary rounded-lg p-4">
        <div className="text-sm text-theme-text-secondary mb-1">Total Equity</div>
        <div className="text-3xl font-bold text-theme-text-primary">
          {formatUsd(totalEquity)}
        </div>
        <div className="flex items-center gap-4 mt-2 text-sm">
          <span className="text-theme-text-muted">
            Free: <span className="text-theme-text-primary font-medium">{formatUsd(freeCollateral)}</span>
          </span>
          {marginRatio < 100 && (
            <span className="text-theme-text-muted">
              Margin: <span className={getRiskLevelColor(riskLevel)}>{marginRatio.toFixed(1)}%</span>
            </span>
          )}
        </div>
      </div>

      {/* Collateral Breakdown */}
      <div>
        <div className="text-sm font-medium text-theme-text-secondary mb-3">
          Collateral Breakdown
        </div>
        <div className="space-y-2">
          {/* NUSDC */}
          {collateral.NUSDC.amount > 0 && (
            <div className="flex items-center justify-between p-3 bg-theme-bg-primary rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="text-green-500 text-xs font-bold">$</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-theme-text-primary">NUSDC</div>
                  <div className="text-xs text-theme-text-muted">
                    {collateral.NUSDC.amount.toFixed(2)} NUSDC
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-theme-text-primary">
                  {formatUsd(collateral.NUSDC.value)}
                </div>
                {collateral.NUSDC.haircut > 0 && (
                  <div className="text-xs text-yellow-500">
                    {collateral.NUSDC.haircut}% haircut
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NBTC */}
          {collateral.NBTC.amount > 0 && (
            <div className="flex items-center justify-between p-3 bg-theme-bg-primary rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-500 text-xs font-bold">B</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-theme-text-primary">NBTC</div>
                  <div className="text-xs text-theme-text-muted">
                    {collateral.NBTC.amount.toFixed(8)} NBTC
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-theme-text-primary">
                  {formatUsd(collateral.NBTC.value)}
                </div>
                <div className="text-xs text-yellow-500">
                  {collateral.NBTC.haircut}% haircut
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {collateral.NUSDC.amount === 0 && collateral.NBTC.amount === 0 && (
            <div className="text-center py-4 text-theme-text-muted text-sm">
              No collateral deposited yet
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setSelectedToken('NUSDC');
            setShowDepositModal(true);
          }}
          className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
        >
          Deposit
        </button>
        <button
          onClick={() => {
            setSelectedToken('NUSDC');
            setShowWithdrawModal(true);
          }}
          disabled={totalCollateralValue === 0}
          className="flex-1 py-3 bg-theme-bg-tertiary hover:bg-theme-bg-primary text-theme-text-primary font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>

      {/* Risk Warning */}
      {riskLevel >= 1 && (
        <div className={`p-4 rounded-lg border ${
          riskLevel >= 2
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-yellow-500/10 border-yellow-500/30'
        }`}>
          <div className="flex items-start gap-3">
            <span className="text-xl">
              {riskLevel >= 2 ? '⚠️' : '⚡'}
            </span>
            <div>
              <div className={`font-medium ${riskLevel >= 2 ? 'text-red-400' : 'text-yellow-400'}`}>
                {riskLevel >= 2 ? 'Liquidation Risk' : 'Low Margin Warning'}
              </div>
              <p className="text-sm text-theme-text-secondary mt-1">
                {riskLevel >= 2
                  ? 'Your margin ratio is below maintenance level. Add collateral to avoid liquidation.'
                  : 'Your margin is approaching the warning threshold. Consider adding more collateral.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
              Deposit Collateral
            </h3>

            {/* Token Selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSelectedToken('NUSDC')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  selectedToken === 'NUSDC'
                    ? 'bg-green-500 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
                }`}
              >
                NUSDC
              </button>
              <button
                onClick={() => setSelectedToken('NBTC')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  selectedToken === 'NBTC'
                    ? 'bg-orange-500 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
                }`}
              >
                NBTC
              </button>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-sm text-theme-text-secondary mb-2">
                Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary"
              />
              {selectedToken === 'NBTC' && (
                <p className="text-xs text-yellow-500 mt-2">
                  Note: NBTC has a 5% haircut (95% collateral value)
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-4">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDepositModal(false);
                  setAmount('');
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
                {isDepositing ? 'Depositing...' : 'Deposit'}
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
              Withdraw Collateral
            </h3>

            {/* Token Selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSelectedToken('NUSDC')}
                disabled={collateral.NUSDC.amount === 0}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  selectedToken === 'NUSDC'
                    ? 'bg-green-500 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
                }`}
              >
                NUSDC ({collateral.NUSDC.amount.toFixed(2)})
              </button>
              <button
                onClick={() => setSelectedToken('NBTC')}
                disabled={collateral.NBTC.amount === 0}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  selectedToken === 'NBTC'
                    ? 'bg-orange-500 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
                }`}
              >
                NBTC ({collateral.NBTC.amount.toFixed(8)})
              </button>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-theme-text-secondary">Amount</span>
                <button
                  onClick={() => {
                    const maxAmount = selectedToken === 'NUSDC'
                      ? collateral.NUSDC.amount
                      : collateral.NBTC.amount;
                    setAmount(maxAmount.toString());
                  }}
                  className="text-blue-500 hover:text-blue-400"
                >
                  MAX
                </button>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary"
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-4">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setAmount('');
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
                {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
