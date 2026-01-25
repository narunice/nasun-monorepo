/**
 * BalancePreview Component
 *
 * Displays expected balance changes from a transaction simulation.
 * Renamed from "SimulationDisplay" to "BalancePreview" for friendlier UX.
 *
 * UX Principle: Show "What will happen" not "Simulation results"
 *
 * Display format:
 * - Token changes: "Your USDC -100 → 400"
 * - NFT changes: "You'll receive: CoolNFT #123"
 * - Fee display: "Fee ~0.003 NSN [?]"
 */

import type {
  SimulationResult,
  TokenBalanceChange,
  NFTChange,
  ApprovalChange,
} from '@nasun/wallet';
import { Tooltip } from '../shared';

export interface BalancePreviewProps {
  /** Simulation result from Clear Signing */
  simulation: SimulationResult;
  /** Display mode */
  variant?: 'compact' | 'detailed';
  /** Show contextual tooltips */
  showTooltips?: boolean;
  /** Show USD values if available */
  showUsdValue?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Format token amount for display
 */
function formatAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  // Format with decimals, remove trailing zeros
  const fractional = remainder.toString().padStart(decimals, '0');
  const trimmed = fractional.replace(/0+$/, '');
  return `${whole}.${trimmed.slice(0, 6)}`; // Max 6 decimal places
}

/**
 * What will happen preview
 *
 * @example
 * // Basic usage
 * <BalancePreview simulation={simulation} />
 *
 * // Compact mode
 * <BalancePreview simulation={simulation} variant="compact" />
 */
export function BalancePreview({
  simulation,
  variant = 'detailed',
  showTooltips = true,
  showUsdValue = true,
  className = '',
}: BalancePreviewProps) {
  const hasChanges =
    simulation.balanceChanges.length > 0 ||
    simulation.nftChanges.length > 0 ||
    simulation.approvalChanges.length > 0;

  if (!simulation.success) {
    return (
      <div
        className={`p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 ${className}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-600 dark:text-yellow-400">⚠</span>
          <span className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
            Preview unavailable
          </span>
          {showTooltips && (
            <Tooltip
              content="Transaction preview couldn't be generated. The transaction may still work."
              size="xs"
            />
          )}
        </div>
        {simulation.error && (
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            {simulation.error}
          </p>
        )}
      </div>
    );
  }

  if (!hasChanges) {
    return (
      <div
        className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 ${className}`}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No balance changes expected
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Title */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          What will happen
        </h3>
        {showTooltips && (
          <Tooltip
            content="These are the expected changes to your wallet after this transaction"
            size="xs"
          />
        )}
      </div>

      {/* Token Changes */}
      {simulation.balanceChanges.length > 0 && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 overflow-hidden">
          {simulation.balanceChanges.map((change, index) => (
            <TokenChangeRow
              key={`${change.token}-${index}`}
              change={change}
              variant={variant}
              showUsd={showUsdValue}
              isLast={index === simulation.balanceChanges.length - 1}
            />
          ))}
        </div>
      )}

      {/* NFT Changes */}
      {simulation.nftChanges.length > 0 && (
        <div className="space-y-2">
          {simulation.nftChanges.map((change, index) => (
            <NFTChangeRow
              key={`${change.collection}-${change.tokenId}-${index}`}
              change={change}
              variant={variant}
            />
          ))}
        </div>
      )}

      {/* Approval Changes */}
      {simulation.approvalChanges.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Permissions
          </h4>
          {simulation.approvalChanges.map((change, index) => (
            <ApprovalChangeRow
              key={`${change.token}-${change.spender}-${index}`}
              change={change}
              showTooltips={showTooltips}
            />
          ))}
        </div>
      )}

      {/* Gas Estimate */}
      {simulation.estimatedGas !== undefined && (
        <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
            Estimated fee
            {showTooltips && (
              <Tooltip
                content="Network fee for processing this transaction"
                size="xs"
              />
            )}
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            ~{formatGas(simulation.estimatedGas)} NSN
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Format gas amount (9 decimals for NSN)
 */
function formatGas(gas: bigint): string {
  const decimals = 9;
  const divisor = BigInt(10 ** decimals);
  const whole = gas / divisor;
  const remainder = gas % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  const fractional = remainder.toString().padStart(decimals, '0');
  const trimmed = fractional.replace(/0+$/, '').slice(0, 6);
  return `${whole}.${trimmed}`;
}

interface TokenChangeRowProps {
  change: TokenBalanceChange;
  variant: 'compact' | 'detailed';
  showUsd: boolean;
  isLast: boolean;
}

/**
 * Token balance change row
 */
function TokenChangeRow({ change, variant, showUsd, isLast }: TokenChangeRowProps) {
  const isPositive = change.amount > 0n;
  const absAmount = isPositive ? change.amount : -change.amount;

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 ${
        !isLast ? 'border-b border-gray-200 dark:border-gray-700' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-lg ${
            isPositive
              ? 'text-green-500 dark:text-green-400'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {isPositive ? '↓' : '↑'}
        </span>
        <span className="font-medium text-gray-900 dark:text-white">
          {change.symbol}
        </span>
      </div>

      <div className="text-right">
        <div
          className={`font-medium ${
            isPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isPositive ? '+' : '-'}
          {change.displayAmount || formatAmount(absAmount, change.decimals)}
        </div>
        {showUsd && change.usdValue !== undefined && variant === 'detailed' && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            ${Math.abs(change.usdValue).toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

interface NFTChangeRowProps {
  change: NFTChange;
  variant: 'compact' | 'detailed';
}

/**
 * NFT change row
 */
function NFTChangeRow({ change, variant }: NFTChangeRowProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      {/* NFT Image */}
      {change.imageUrl && variant === 'detailed' && (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
          <img
            src={change.imageUrl}
            alt={change.name || 'NFT'}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              change.isIncoming
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {change.isIncoming ? "You'll receive" : "You'll send"}
          </span>
        </div>
        <div className="text-sm text-gray-900 dark:text-white truncate">
          {change.name || `#${change.tokenId.slice(0, 8)}`}
        </div>
      </div>

      {/* Direction indicator */}
      <span
        className={`text-lg ${
          change.isIncoming
            ? 'text-green-500 dark:text-green-400'
            : 'text-red-500 dark:text-red-400'
        }`}
      >
        {change.isIncoming ? '↓' : '↑'}
      </span>
    </div>
  );
}

interface ApprovalChangeRowProps {
  change: ApprovalChange;
  showTooltips: boolean;
}

/**
 * Approval change row
 */
function ApprovalChangeRow({ change, showTooltips }: ApprovalChangeRowProps) {
  const isRevoking = change.amount === 0n;
  const isUnlimited = change.isUnlimited;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${
        isUnlimited
          ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
          : isRevoking
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-lg ${
            isRevoking
              ? 'text-green-500 dark:text-green-400'
              : isUnlimited
                ? 'text-orange-500 dark:text-orange-400'
                : 'text-yellow-500 dark:text-yellow-400'
          }`}
        >
          {isRevoking ? '🚫' : '🛡'}
        </span>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {isRevoking ? 'Revoke access' : 'Allow spending'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {change.spenderName || formatAddress(change.spender)}
          </div>
        </div>
      </div>

      <div className="text-right flex items-center gap-1">
        <span
          className={`text-sm font-medium ${
            isUnlimited
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {isRevoking ? 'Removing' : isUnlimited ? 'Unlimited' : formatAmount(change.amount, 6)}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {change.symbol}
        </span>
        {isUnlimited && showTooltips && (
          <Tooltip
            content="This allows the contract to spend any amount of this token. Consider setting a specific limit."
            size="xs"
            variant="info"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Format address for display
 */
function formatAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
