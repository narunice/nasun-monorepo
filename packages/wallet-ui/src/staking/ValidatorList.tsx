/**
 * ValidatorList Component
 * Displays a list of validators with APY and stake info
 */

import {
  useValidators,
  type ValidatorInfo,
  formatApy,
  formatStakedAmount,
} from '@nasun/wallet';

interface ValidatorListProps {
  // Selected validator address
  selected?: string;
  // Called when a validator is selected
  onSelect?: (validator: ValidatorInfo) => void;
  // Compact mode for smaller display
  compact?: boolean;
  // Hide validators with 0 stake
  hideEmptyStake?: boolean;
}

export function ValidatorList({
  selected,
  onSelect,
  compact = false,
  hideEmptyStake = false,
}: ValidatorListProps) {
  const { data: validators, isLoading, error } = useValidators();

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-200 dark:bg-zinc-700 rounded-lg h-16"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg">
        <p className="text-sm xl:text-base text-red-600 dark:text-red-400">Failed to load validators</p>
      </div>
    );
  }

  const filteredValidators = validators?.filter((v) =>
    hideEmptyStake ? v.stakingPoolSuiBalance > 0n : true
  ) || [];

  if (filteredValidators.length === 0) {
    return (
      <div className="p-4 bg-gray-200/50 dark:bg-zinc-700/50 rounded-lg">
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400 text-center">No validators available</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${compact ? '' : 'p-2'}`}>
      {filteredValidators.map((validator) => (
        <ValidatorCard
          key={validator.address}
          validator={validator}
          isSelected={selected === validator.address}
          onSelect={onSelect}
          compact={compact}
        />
      ))}
    </div>
  );
}

interface ValidatorCardProps {
  validator: ValidatorInfo;
  isSelected: boolean;
  onSelect?: (validator: ValidatorInfo) => void;
  compact: boolean;
}

function ValidatorCard({ validator, isSelected, onSelect, compact }: ValidatorCardProps) {
  const handleClick = () => {
    onSelect?.(validator);
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={`w-full p-3 rounded-lg transition-colors text-left ${
          isSelected
            ? 'bg-blue-600/20 border border-blue-500'
            : 'bg-gray-200/50 dark:bg-zinc-700/50 hover:bg-gray-200 dark:hover:bg-zinc-700 border border-transparent'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {validator.imageUrl ? (
              <img
                src={validator.imageUrl}
                alt={validator.name}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center">
                <span className="text-xs xl:text-sm text-gray-600 dark:text-zinc-300">{validator.name[0]}</span>
              </div>
            )}
            <span className="text-sm xl:text-base text-gray-900 dark:text-white font-medium truncate max-w-[120px]">
              {validator.name}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm xl:text-base text-green-600 dark:text-green-400 font-medium">
              {formatApy(validator.apy)}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full p-4 rounded-lg transition-colors text-left ${
        isSelected
          ? 'bg-blue-600/20 border-2 border-blue-500'
          : 'bg-gray-200/50 dark:bg-zinc-700/50 hover:bg-gray-200 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-600'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Validator Avatar */}
        {validator.imageUrl ? (
          <img
            src={validator.imageUrl}
            alt={validator.name}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center">
            <span className="text-lg xl:text-xl text-gray-600 dark:text-zinc-300">{validator.name[0]}</span>
          </div>
        )}

        {/* Validator Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white truncate">
              {validator.name}
            </h4>
            <span className="text-sm xl:text-base text-green-600 dark:text-green-400 font-medium ml-2">
              {formatApy(validator.apy)}
            </span>
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
              Commission: {(validator.commissionRate * 100).toFixed(0)}%
            </span>
            <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
              Pool: {formatStakedAmount(validator.stakingPoolSuiBalance)}
            </span>
          </div>

          {validator.description && (
            <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-500 mt-1 truncate">
              {validator.description}
            </p>
          )}
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div className="ml-2">
            <svg
              className="w-5 h-5 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}
