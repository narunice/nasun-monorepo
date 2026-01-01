/**
 * StakingPanel Component
 * Standalone staking panel with Stake/Unstake/Positions tabs
 * Can be used independently or integrated into WalletConnect
 */

import { useState } from 'react';
import {
  useWallet,
  useBalance,
  useStakeTransaction,
  useStaking,
  formatStakedAmount,
  type ValidatorInfo,
} from '@nasun/wallet';
import { ValidatorList } from './ValidatorList';
import { StakingStatus } from './StakingStatus';
import { CopyableAddress } from './CopyableAddress';

type TabType = 'stake' | 'unstake' | 'positions';
type StakeStep = 'select' | 'amount' | 'confirm' | 'result';
type UnstakeStep = 'select' | 'confirm' | 'result';

// Minimum stake amount
const MIN_STAKE_NASUN = 1;

interface StakingPanelProps {
  // Called when close button is clicked
  onClose?: () => void;
  // Initial tab
  initialTab?: TabType;
  // Compact mode (for dropdown integration)
  compact?: boolean;
}

export function StakingPanel({
  onClose,
  initialTab = 'stake',
  compact = false,
}: StakingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const { status, account } = useWallet();

  // Not connected
  if (status !== 'unlocked' || !account) {
    return (
      <div className={`bg-gray-100 dark:bg-zinc-800 rounded-lg ${compact ? 'p-3' : 'p-4'}`}>
        <p className="text-gray-500 dark:text-zinc-400 text-sm text-center">
          Please connect your wallet first.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-gray-100 dark:bg-zinc-800 rounded-lg ${compact ? '' : 'min-w-[360px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-zinc-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Staking</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-300 dark:border-zinc-700">
        {(['stake', 'positions', 'unstake'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-500 dark:text-blue-400 border-b-2 border-blue-500 dark:border-blue-400'
                : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={compact ? 'max-h-[400px] overflow-y-auto' : ''}>
        {activeTab === 'stake' && <StakeTab compact={compact} />}
        {activeTab === 'unstake' && <UnstakeTab compact={compact} />}
        {activeTab === 'positions' && (
          <div className="p-4">
            <StakingStatus compact={compact} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Stake Tab
// ============================================================================

interface StakeTabProps {
  compact: boolean;
}

function StakeTab({ compact }: StakeTabProps) {
  const [step, setStep] = useState<StakeStep>('select');
  const [selectedValidator, setSelectedValidator] = useState<ValidatorInfo | null>(null);
  const [amount, setAmount] = useState('');

  const { data: balance } = useBalance();
  const { stake, isPending, error, lastResult, clearError, clearResult } = useStakeTransaction();

  // Reset flow
  const handleReset = () => {
    setStep('select');
    setSelectedValidator(null);
    setAmount('');
    clearError();
    clearResult();
  };

  // Success result
  if (lastResult?.status === 'success' && lastResult.operationType === 'stake') {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Stake Successful</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              {lastResult.amount} NASUN staked
            </p>
          </div>

          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <CopyableAddress
              value={lastResult.digest}
              label="Transaction"
              shorten={12}
              showCopy
              showExplorer
              explorerType="tx"
            />
          </div>

          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
          >
            Stake More
          </button>
        </div>
      </div>
    );
  }

  // Confirm step
  if (step === 'confirm' && selectedValidator) {
    return (
      <div className="p-4 space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Confirm Stake</h4>

        <div className="bg-gray-200 dark:bg-zinc-700 rounded-lg p-3 space-y-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Validator</p>
            <p className="text-sm text-gray-900 dark:text-white mt-1">{selectedValidator.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Amount</p>
            <p className="text-lg text-gray-900 dark:text-white font-medium mt-1">
              {amount} <span className="text-blue-500 dark:text-blue-400 text-sm">NASUN</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Expected APY</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              {(selectedValidator.apy * 100).toFixed(2)}%
            </p>
          </div>
        </div>

        <div className="bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded p-3">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Staked tokens will be activated at the next epoch (typically within 24 hours).
          </p>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setStep('amount');
              clearError();
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 disabled:bg-gray-100 dark:disabled:bg-zinc-800 text-gray-900 dark:text-white rounded transition-colors"
          >
            Back
          </button>
          <button
            onClick={async () => {
              await stake({
                amount,
                validatorAddress: selectedValidator.address,
              });
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-zinc-600 text-white font-medium rounded transition-colors"
          >
            {isPending ? 'Staking...' : 'Confirm Stake'}
          </button>
        </div>
      </div>
    );
  }

  // Amount step
  if (step === 'amount' && selectedValidator) {
    const availableBalance = balance?.formattedBalance || '0';
    const numericBalance = parseFloat(availableBalance);
    const numericAmount = parseFloat(amount) || 0;
    const isBelowMinimum = numericAmount > 0 && numericAmount < MIN_STAKE_NASUN;
    const isAboveBalance = numericAmount > numericBalance;
    const isValidAmount = numericAmount >= MIN_STAKE_NASUN && numericAmount <= numericBalance;
    // Keep some for gas
    const maxStake = Math.max(0, numericBalance - 0.01).toFixed(4);

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep('select')}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Stake to {selectedValidator.name}</h4>
        </div>

        <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded p-3">
          <p className="text-xs text-gray-500 dark:text-zinc-400">Available Balance</p>
          <p className="text-lg text-gray-900 dark:text-white font-medium mt-1">
            {availableBalance} <span className="text-blue-500 dark:text-blue-400 text-sm">NASUN</span>
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-500 dark:text-zinc-400">Stake Amount</label>
            <button
              onClick={() => setAmount(maxStake)}
              className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
            >
              Max
            </button>
          </div>
          <input
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.0001"
            min="0"
            className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isBelowMinimum && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">Minimum stake is {MIN_STAKE_NASUN} NASUN</p>
          )}
          {isAboveBalance && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">Insufficient balance</p>
          )}
        </div>

        <button
          onClick={() => setStep('confirm')}
          disabled={!isValidAmount}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  // Select validator step
  return (
    <div className="p-4 space-y-3">
      <h4 className="text-sm font-medium text-gray-900 dark:text-white">Select Validator</h4>
      <ValidatorList
        selected={selectedValidator?.address}
        onSelect={(v) => {
          setSelectedValidator(v);
          setStep('amount');
        }}
        compact={compact}
      />
    </div>
  );
}

// ============================================================================
// Unstake Tab
// ============================================================================

interface UnstakeTabProps {
  compact: boolean;
}

function UnstakeTab({ compact }: UnstakeTabProps) {
  const [step, setStep] = useState<UnstakeStep>('select');
  const [selectedStake, setSelectedStake] = useState<{
    stakedSuiId: string;
    principal: bigint;
  } | null>(null);

  const { stakes } = useStaking();
  const { unstake, isPending, error, lastResult, clearError, clearResult } = useStakeTransaction();

  // Reset flow
  const handleReset = () => {
    setStep('select');
    setSelectedStake(null);
    clearError();
    clearResult();
  };

  // Success result
  if (lastResult?.status === 'success' && lastResult.operationType === 'unstake') {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Unstake Successful</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              Your NASUN will be available after the current epoch ends.
            </p>
          </div>

          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <CopyableAddress
              value={lastResult.digest}
              label="Transaction"
              shorten={12}
              showCopy
              showExplorer
              explorerType="tx"
            />
          </div>

          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white font-medium rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Confirm step
  if (step === 'confirm' && selectedStake) {
    return (
      <div className="p-4 space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Confirm Unstake</h4>

        <div className="bg-gray-200 dark:bg-zinc-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 dark:text-zinc-400">Amount to Unstake</p>
          <p className="text-lg text-gray-900 dark:text-white font-medium mt-1">
            {formatStakedAmount(selectedStake.principal)}{' '}
            <span className="text-blue-500 dark:text-blue-400 text-sm">NASUN</span>
          </p>
        </div>

        <div className="bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded p-3">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Unstaked tokens will be available after the current epoch ends (typically within 24 hours).
          </p>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setStep('select');
              clearError();
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 disabled:bg-gray-100 dark:disabled:bg-zinc-800 text-gray-900 dark:text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              await unstake({
                stakedSuiId: selectedStake.stakedSuiId,
              });
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 dark:disabled:bg-zinc-600 text-white font-medium rounded transition-colors"
          >
            {isPending ? 'Unstaking...' : 'Confirm Unstake'}
          </button>
        </div>
      </div>
    );
  }

  // Select position step
  if (stakes.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 mx-auto text-gray-400 dark:text-zinc-500 mb-3"
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
          <p className="text-sm text-gray-500 dark:text-zinc-400">No active stakes to unstake</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h4 className="text-sm font-medium text-gray-900 dark:text-white">Select Position to Unstake</h4>
      <StakingStatus
        compact={compact}
        hideSummary
        onUnstake={(stakedSuiId, principal) => {
          setSelectedStake({ stakedSuiId, principal });
          setStep('confirm');
        }}
      />
    </div>
  );
}
