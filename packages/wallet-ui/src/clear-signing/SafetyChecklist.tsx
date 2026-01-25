/**
 * SafetyChecklist Component
 *
 * Displays transaction safety checks in a friendly checklist format.
 * Renamed from "RiskFactorsList" to reframe as verification, not warnings.
 *
 * UX Principle: Security is an assurance element, not a fear factor
 *
 * Display format:
 * - Passed checks: ✓ checkmark in green
 * - Warnings: ! in yellow
 * - Issues: ⚠ in orange/red
 */

import type { RiskFactor, TxRiskLevel } from '@nasun/wallet';
import { Tooltip } from '../shared';
import * as React from 'react';

export interface SafetyChecklistProps {
  /** Risk factors from Clear Signing */
  factors: RiskFactor[];
  /** Default expansion state */
  defaultExpanded?: boolean;
  /** Maximum items to show when collapsed */
  maxCollapsed?: number;
  /** Show mitigation suggestions */
  showMitigations?: boolean;
  /** Additional class names */
  className?: string;
}

/** Configuration for each risk level display */
interface LevelConfig {
  icon: string;
  label: string;
  styles: string;
  bgStyles: string;
}

const LEVEL_CONFIG: Record<TxRiskLevel, LevelConfig> = {
  low: {
    icon: '✓',
    label: 'Verified',
    styles: 'text-green-600 dark:text-green-400',
    bgStyles: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  },
  medium: {
    icon: 'ℹ',
    label: 'Note',
    styles: 'text-yellow-600 dark:text-yellow-400',
    bgStyles: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  },
  high: {
    icon: '⚠',
    label: 'Attention',
    styles: 'text-orange-600 dark:text-orange-400',
    bgStyles: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
  },
  critical: {
    icon: '⚡',
    label: 'Important',
    styles: 'text-red-600 dark:text-red-400',
    bgStyles: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  },
};

/**
 * Count factors by level
 */
function countByLevel(factors: RiskFactor[]): Record<TxRiskLevel, number> {
  return factors.reduce(
    (acc, factor) => {
      acc[factor.level]++;
      return acc;
    },
    { low: 0, medium: 0, high: 0, critical: 0 } as Record<TxRiskLevel, number>
  );
}

/**
 * Safety checks checklist component
 *
 * @example
 * // Basic usage
 * <SafetyChecklist factors={riskAssessment.factors} />
 *
 * // With mitigation hints
 * <SafetyChecklist factors={factors} showMitigations />
 */
export function SafetyChecklist({
  factors,
  defaultExpanded = false,
  maxCollapsed = 3,
  showMitigations = false,
  className = '',
}: SafetyChecklistProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  if (factors.length === 0) {
    return (
      <div
        className={`p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 ${className}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-green-600 dark:text-green-400">✓</span>
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            All checks passed
          </span>
        </div>
      </div>
    );
  }

  const counts = countByLevel(factors);
  const passedCount = counts.low;
  const totalCount = factors.length;

  // Sort factors: critical first, then high, medium, low
  const sortedFactors = [...factors].sort((a, b) => {
    const order: Record<TxRiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.level] - order[b.level];
  });

  const visibleFactors = expanded ? sortedFactors : sortedFactors.slice(0, maxCollapsed);
  const hasMore = sortedFactors.length > maxCollapsed;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Safety Checks
          </h3>
          <Tooltip
            content="Automated verification of transaction safety"
            size="xs"
          />
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            counts.critical > 0 || counts.high > 0
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          }`}
        >
          {passedCount}/{totalCount} passed
        </span>
      </div>

      {/* Factor list */}
      <div className="space-y-2">
        {visibleFactors.map((factor, index) => (
          <FactorItem
            key={`${factor.category}-${index}`}
            factor={factor}
            showMitigation={showMitigations}
          />
        ))}
      </div>

      {/* Show more/less toggle */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
        >
          {expanded
            ? 'Show less'
            : `Show ${sortedFactors.length - maxCollapsed} more check${
                sortedFactors.length - maxCollapsed > 1 ? 's' : ''
              }`}
        </button>
      )}
    </div>
  );
}

interface FactorItemProps {
  factor: RiskFactor;
  showMitigation: boolean;
}

/**
 * Individual factor item
 */
function FactorItem({ factor, showMitigation }: FactorItemProps) {
  const config = LEVEL_CONFIG[factor.level];
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div
      className={`rounded-md border ${config.bgStyles} overflow-hidden transition-all`}
    >
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {/* Icon */}
        <span className={`flex-shrink-0 text-lg ${config.styles}`}>
          {config.icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {factor.title}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                factor.level === 'low'
                  ? 'bg-green-200/50 text-green-700 dark:bg-green-800/30 dark:text-green-400'
                  : factor.level === 'medium'
                    ? 'bg-yellow-200/50 text-yellow-700 dark:bg-yellow-800/30 dark:text-yellow-400'
                    : factor.level === 'high'
                      ? 'bg-orange-200/50 text-orange-700 dark:bg-orange-800/30 dark:text-orange-400'
                      : 'bg-red-200/50 text-red-700 dark:bg-red-800/30 dark:text-red-400'
              }`}
            >
              {config.label}
            </span>
          </div>
          {factor.description && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
              {factor.description}
            </p>
          )}
        </div>

        {/* Expand indicator */}
        {(factor.mitigation || showMitigation) && (
          <span className="text-gray-400 dark:text-gray-500 text-sm">
            {showDetails ? '−' : '+'}
          </span>
        )}
      </button>

      {/* Expanded mitigation */}
      {showDetails && factor.mitigation && (
        <div className="px-3 pb-3 pl-10">
          <div className="p-2 rounded bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Suggestion:{' '}
              </span>
              {factor.mitigation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get summary text for risk factors
 */
export function getSafetyCheckSummary(factors: RiskFactor[]): {
  text: string;
  level: TxRiskLevel;
} {
  if (factors.length === 0) {
    return { text: 'All checks passed', level: 'low' };
  }

  const counts = countByLevel(factors);

  if (counts.critical > 0) {
    return {
      text: `${counts.critical} issue${counts.critical > 1 ? 's' : ''} need${counts.critical === 1 ? 's' : ''} attention`,
      level: 'critical',
    };
  }

  if (counts.high > 0) {
    return {
      text: `${counts.high} item${counts.high > 1 ? 's' : ''} to review`,
      level: 'high',
    };
  }

  if (counts.medium > 0) {
    return {
      text: `${counts.medium} note${counts.medium > 1 ? 's' : ''}`,
      level: 'medium',
    };
  }

  return { text: 'All checks passed', level: 'low' };
}
