/**
 * StakingSection
 * Main staking section with StakingPanel and info cards
 */

import { useState, useCallback } from 'react';
import { StakingPanel } from '@nasun/wallet-ui';
import { useStaking, useValidators, useBalance, useWallet, useZkLogin, type ValidatorInfo } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { requestFaucet } from '../../../lib/sui-client';

export function StakingSection() {
  const { summary, isLoading: stakingLoading } = useStaking();
  const { data: validators, isLoading: validatorsLoading } = useValidators();
  const { data: balance, isLoading: balanceLoading } = useBalance();
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const queryClient = useQueryClient();

  const [isFaucetLoading, setIsFaucetLoading] = useState(false);

  // Determine active address (zkLogin takes priority)
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : undefined;
  const isWalletConnected = status === 'unlocked' || isZkLoggedIn;

  // Format balance
  const formattedBalance = balance?.formattedBalance || '0';

  // NASUN Faucet handler
  const handleNasunFaucet = useCallback(async () => {
    if (!walletAddress) return;

    setIsFaucetLoading(true);
    try {
      const success = await requestFaucet(walletAddress);
      if (success) {
        // Refresh balance after 2 seconds
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
          queryClient.invalidateQueries({ queryKey: ['wallet-multi-balance'] });
        }, 2000);
      }
    } catch (error) {
      console.error('Faucet error:', error);
    } finally {
      setIsFaucetLoading(false);
    }
  }, [walletAddress, queryClient]);

  // Calculate average APY from validators
  const validatorList = validators || [];
  const averageAPY = validatorList.length > 0
    ? validatorList.reduce((sum: number, v: ValidatorInfo) => sum + v.apy, 0) / validatorList.length
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Staking Panel */}
      <div className="lg:col-span-2">
        <StakingPanel />
      </div>

      {/* Right: Info Cards */}
      <div className="space-y-4">
        {/* Staking Overview Card */}
        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-theme-text-secondary mb-4">
            Staking Overview
          </h3>

          <div className="space-y-4">
            {/* Available Balance */}
            {isWalletConnected && (
              <div>
                <p className="text-xs text-theme-text-muted">Available Balance</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xl font-bold text-theme-text-primary">
                    {balanceLoading ? (
                      <span className="text-theme-text-muted">Loading...</span>
                    ) : (
                      <>
                        {formattedBalance}{' '}
                        <span className="text-sm font-normal text-blue-400">NASUN</span>
                      </>
                    )}
                  </p>
                  <button
                    onClick={handleNasunFaucet}
                    disabled={isFaucetLoading}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white transition-colors"
                  >
                    {isFaucetLoading ? 'Requesting...' : 'Get NASUN'}
                  </button>
                </div>
              </div>
            )}

            {/* Your Staked */}
            <div>
              <p className="text-xs text-theme-text-muted">Your Staked</p>
              <p className="text-xl font-bold text-theme-text-primary mt-1">
                {stakingLoading ? (
                  <span className="text-theme-text-muted">Loading...</span>
                ) : (
                  <>
                    {summary?.formattedTotalStaked || '0'}{' '}
                    <span className="text-sm font-normal text-blue-400">NASUN</span>
                  </>
                )}
              </p>
            </div>

            {/* Your Rewards */}
            <div>
              <p className="text-xs text-theme-text-muted">Estimated Rewards</p>
              <p className="text-lg font-semibold text-green-500 mt-1">
                {stakingLoading ? (
                  <span className="text-theme-text-muted">Loading...</span>
                ) : (
                  <>
                    +{summary?.formattedTotalRewards || '0'}{' '}
                    <span className="text-sm font-normal">NASUN</span>
                  </>
                )}
              </p>
            </div>

            {/* Average APY */}
            <div>
              <p className="text-xs text-theme-text-muted">Average APY</p>
              <p className="text-lg font-semibold text-theme-text-primary mt-1">
                {validatorsLoading ? (
                  <span className="text-theme-text-muted">Loading...</span>
                ) : (
                  <span className="text-green-500">
                    {(averageAPY * 100).toFixed(2)}%
                  </span>
                )}
              </p>
            </div>

            {/* Active Validators */}
            <div>
              <p className="text-xs text-theme-text-muted">Active Validators</p>
              <p className="text-lg font-semibold text-theme-text-primary mt-1">
                {validatorsLoading ? (
                  <span className="text-theme-text-muted">Loading...</span>
                ) : (
                  validatorList.length
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Staking Info Card */}
        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-theme-text-secondary mb-3">
            How Staking Works
          </h3>

          <ul className="space-y-2 text-xs text-theme-text-muted">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">1.</span>
              <span>Select a validator and stake your NASUN</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">2.</span>
              <span>Earn rewards each epoch (~24 hours)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">3.</span>
              <span>Unstake anytime (available next epoch)</span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-theme-border">
            <p className="text-xs text-theme-text-muted">
              <span className="text-yellow-500">Note:</span> Minimum stake is 1 NASUN.
              Keep some NASUN unstaked for transaction fees.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
