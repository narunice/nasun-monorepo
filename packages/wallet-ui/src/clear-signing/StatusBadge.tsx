/**
 * StatusBadge Component
 *
 * Displays transaction safety status in a user-friendly way.
 * Rebranded from "Risk" to "Safety Status" - security as protection, not threat.
 *
 * UX Principle: Security is an assurance element, not a fear factor
 *
 * Label mapping:
 * - low → "Verified ✓" (Green)
 * - medium → "Review Recommended" (Yellow)
 * - high → "Attention Needed" (Orange)
 * - critical → "Action Required" (Red)
 */

import type { TxRiskLevel } from '@nasun/wallet';
import { Tooltip } from '../shared';

export interface StatusBadgeProps {
  /** Internal risk level from Clear Signing */
  level: TxRiskLevel;
  /** Badge variant */
  variant?: 'compact' | 'full';
  /** Show score (0-100) */
  showScore?: boolean;
  /** Risk score */
  score?: number;
  /** Show tooltip with explanation */
  showTooltip?: boolean;
  /** Additional class names */
  className?: string;
}

/** User-friendly status configuration */
interface StatusConfig {
  label: string;
  shortLabel: string;
  icon: string;
  tooltip: string;
  styles: string;
}

const STATUS_CONFIG: Record<TxRiskLevel, StatusConfig> = {
  low: {
    label: 'Verified',
    shortLabel: '',
    icon: '✓',
    tooltip: 'This transaction has been verified as safe',
    styles: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30',
  },
  medium: {
    label: 'Review Recommended',
    shortLabel: 'Review',
    icon: 'ℹ',
    tooltip: 'Please review the transaction details before confirming',
    styles: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30',
  },
  high: {
    label: 'Attention Needed',
    shortLabel: 'Attention',
    icon: '⚠',
    tooltip: 'This transaction requires your attention before proceeding',
    styles: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30',
  },
  critical: {
    label: 'Action Required',
    shortLabel: 'Action',
    icon: '⚡',
    tooltip: 'Important: Please carefully review all details before confirming',
    styles: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30',
  },
};

/**
 * Safety status badge for transactions
 *
 * @example
 * // Basic usage
 * <StatusBadge level="low" />
 *
 * // With score
 * <StatusBadge level="medium" showScore score={45} />
 *
 * // Compact variant
 * <StatusBadge level="high" variant="compact" />
 */
export function StatusBadge({
  level,
  variant = 'full',
  showScore = false,
  score,
  showTooltip = true,
  className = '',
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[level];

  const badge = (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${variant === 'compact' ? 'px-2 py-0.5 text-xs xl:text-sm' : 'px-3 py-1 text-sm xl:text-base'}
        ${config.styles}
        ${className}
      `}
    >
      <span className="flex-shrink-0">{config.icon}</span>
      {(variant === 'compact' ? config.shortLabel : config.label) && (
        <span>{variant === 'compact' ? config.shortLabel : config.label}</span>
      )}
      {showScore && score !== undefined && (
        <span className="opacity-75">({score})</span>
      )}
    </span>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <span className="inline-flex items-center gap-1">
      {badge}
      <Tooltip content={config.tooltip} size="xs" position="left" />
    </span>
  );
}

/**
 * Get user-friendly label for a risk level
 */
export function getStatusLabel(level: TxRiskLevel, variant: 'full' | 'short' = 'full'): string {
  const config = STATUS_CONFIG[level];
  return variant === 'short' ? config.shortLabel : config.label;
}

/**
 * Get tooltip content for a risk level
 */
export function getStatusTooltip(level: TxRiskLevel): string {
  return STATUS_CONFIG[level].tooltip;
}
