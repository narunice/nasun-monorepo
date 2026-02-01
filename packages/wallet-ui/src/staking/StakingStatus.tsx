/**
 * StakingStatus Component
 * Displays current staking positions and summary
 */

import {
  useStaking,
  useValidator,
  formatStakedAmount,
  type StakeInfo,
  type DelegatedStake,
} from '@nasun/wallet';

interface StakingStatusProps {
  // Called when unstake button is clicked on a position
  onUnstake?: (stakedSuiId: string, principal: bigint) => void;
  // Compact mode for smaller display
  compact?: boolean;
  // Hide summary section
  hideSummary?: boolean;
}

export function StakingStatus({
  onUnstake,
  compact = false,
  hideSummary = false,
}: StakingStatusProps) {
  const { stakes, summary, isLoading, error } = useStaking();

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-gray-200 dark:bg-zinc-700 rounded-lg" />
          <div className="h-16 bg-gray-200 dark:bg-zinc-700 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg">
        <p className="text-sm xl:text-base text-red-600 dark:text-red-400">Failed to load staking data</p>
      </div>
    );
  }

  if (stakes.length === 0) {
    return (
      <div className="p-4 bg-gray-200/50 dark:bg-zinc-700/50 rounded-lg">
        <div className="text-center">
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
          <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">No active stakes</p>
          <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-500 mt-1">
            Stake NSN to earn rewards
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {!hideSummary && (
        <div className={`bg-gray-200/50 dark:bg-zinc-700/50 rounded-lg ${compact ? 'p-3' : 'p-4'}`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Total Staked</p>
              <p className={`font-medium text-gray-900 dark:text-white ${compact ? 'text-base xl:text-lg' : 'text-lg xl:text-xl'}`}>
                {summary.formattedTotalStaked}
              </p>
            </div>
            <div>
              <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Estimated Rewards</p>
              <p className={`font-medium text-green-600 dark:text-green-400 ${compact ? 'text-base xl:text-lg' : 'text-lg xl:text-xl'}`}>
                +{summary.formattedTotalRewards}
              </p>
            </div>
          </div>
          <div className="flex gap-4 mt-3 text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
            <span>Active: {summary.activeStakeCount}</span>
            {summary.pendingStakeCount > 0 && (
              <span>Pending: {summary.pendingStakeCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Stake Positions */}
      <div className="space-y-2">
        {stakes.map((delegatedStake: DelegatedStake) => (
          <StakePositionCard
            key={delegatedStake.validatorAddress}
            validatorAddress={delegatedStake.validatorAddress}
            stakes={delegatedStake.stakes}
            onUnstake={onUnstake}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

interface StakePositionCardProps {
  validatorAddress: string;
  stakes: StakeInfo[];
  onUnstake?: (stakedSuiId: string, principal: bigint) => void;
  compact: boolean;
}

function StakePositionCard({
  validatorAddress,
  stakes,
  onUnstake,
  compact,
}: StakePositionCardProps) {
  const { data: validator } = useValidator(validatorAddress);

  // Calculate total staked with this validator
  const totalPrincipal = stakes.reduce((sum, s) => sum + s.principal, 0n);
  const totalRewards = stakes.reduce((sum, s) => sum + (s.estimatedReward || 0n), 0n);

  return (
    <div className={`bg-gray-200/50 dark:bg-zinc-700/50 rounded-lg border border-gray-300 dark:border-zinc-600 ${compact ? 'p-3' : 'p-4'}`}>
      {/* Validator header */}
      <div className="flex items-center gap-3 mb-3">
        {validator?.imageUrl ? (
          <img
            src={validator.imageUrl}
            alt={validator.name}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center">
            <span className="text-sm xl:text-base text-gray-600 dark:text-zinc-300">
              {validator?.name?.[0] || '?'}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white truncate">
            {validator?.name || 'Unknown Validator'}
          </h4>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 font-mono truncate">
            {validatorAddress.slice(0, 8)}...{validatorAddress.slice(-6)}
          </p>
        </div>
      </div>

      {/* Stake summary for this validator */}
      <div className="bg-gray-100 dark:bg-zinc-800/50 rounded p-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Staked</p>
            <p className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">
              {formatStakedAmount(totalPrincipal)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Rewards</p>
            <p className="text-sm xl:text-base font-medium text-green-600 dark:text-green-400">
              +{formatStakedAmount(totalRewards)}
            </p>
          </div>
        </div>
      </div>

      {/* Individual stake positions */}
      <div className="space-y-2">
        {stakes.map((stake) => (
          <StakePositionItem
            key={stake.stakedSuiId}
            stake={stake}
            onUnstake={onUnstake}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

interface StakePositionItemProps {
  stake: StakeInfo;
  onUnstake?: (stakedSuiId: string, principal: bigint) => void;
  compact: boolean;
}

function StakePositionItem({ stake, onUnstake, compact }: StakePositionItemProps) {
  const getStatusColor = (status: StakeInfo['status']) => {
    switch (status) {
      case 'Active':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/10';
      case 'Pending':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/10';
      case 'Unstaked':
        return 'text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-500/10';
      default:
        return 'text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-500/10';
    }
  };

  return (
    <div className="flex items-center justify-between bg-gray-100/50 dark:bg-zinc-800/30 rounded p-2">
      <div className="flex items-center gap-2">
        <span className={`text-xs xl:text-sm px-2 py-0.5 rounded ${getStatusColor(stake.status)}`}>
          {stake.status}
        </span>
        <span className="text-sm xl:text-base text-gray-900 dark:text-white">
          {formatStakedAmount(stake.principal)}
        </span>
        {stake.estimatedReward && stake.estimatedReward > 0n && (
          <span className="text-xs xl:text-sm text-green-600 dark:text-green-400">
            +{formatStakedAmount(stake.estimatedReward)}
          </span>
        )}
      </div>

      {stake.status === 'Active' && onUnstake && (
        <button
          onClick={() => onUnstake(stake.stakedSuiId, stake.principal)}
          className={`text-xs xl:text-sm px-2 py-1 bg-gray-200 dark:bg-zinc-600 hover:bg-gray-300 dark:hover:bg-zinc-500 text-gray-900 dark:text-white rounded transition-colors ${
            compact ? '' : 'px-3'
          }`}
        >
          Unstake
        </button>
      )}
    </div>
  );
}
