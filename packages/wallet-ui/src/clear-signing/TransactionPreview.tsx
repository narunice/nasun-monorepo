/**
 * TransactionPreview Component
 *
 * Main Clear Signing UI - displays human-readable transaction preview.
 * Implements Progressive Disclosure with Simple/Advanced modes.
 *
 * UX Philosophy: "Complex inside, Calm outside"
 *
 * Simple Mode (default):
 * - One-line summary
 * - Safety status badge
 * - Confirm/Cancel buttons
 *
 * Advanced Mode (toggle):
 * - Full action list
 * - Balance changes preview
 * - Safety checklist
 * - Technical details
 */

import type {
  DecodedTx,
  TxSummary,
  RiskAssessment,
  SimulationResult,
} from '@nasun/wallet';
import * as React from 'react';
import { StatusBadge } from './StatusBadge';
import { ActionsList } from './ActionsList';
import { BalancePreview } from './BalancePreview';
import { SafetyChecklist } from './SafetyChecklist';
import { Tooltip } from '../shared';

export interface TransactionPreviewProps {
  /** Decoded transaction data */
  decoded: DecodedTx;
  /** Human-readable summary */
  summary: TxSummary;
  /** Risk assessment */
  risk: RiskAssessment;
  /** Simulation result */
  simulation?: SimulationResult;
  /** Approve transaction callback */
  onApprove: () => void;
  /** Reject transaction callback */
  onReject: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Render as modal (adds backdrop and close button) */
  asModal?: boolean;
  /** Close callback for modal mode */
  onClose?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Format gas cost for display
 */
function formatGasCost(summary: TxSummary): string {
  if (summary.isSponsored) {
    return 'Sponsored';
  }
  return summary.gasCost || 'Calculating...';
}

/**
 * Format address for display
 */
function formatAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Transaction preview component
 *
 * @example
 * // Basic usage
 * <TransactionPreview
 *   decoded={decodedTx}
 *   summary={summary}
 *   risk={riskAssessment}
 *   onApprove={handleApprove}
 *   onReject={handleReject}
 * />
 *
 * // As modal
 * <TransactionPreview
 *   {...props}
 *   asModal
 *   onClose={handleClose}
 * />
 */
export function TransactionPreview({
  decoded,
  summary,
  risk,
  simulation,
  onApprove,
  onReject,
  isLoading = false,
  asModal = false,
  onClose,
  className = '',
}: TransactionPreviewProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  // Require explicit confirmation for critical risk
  const requiresConfirmation = risk.requiresExtraConfirmation;
  const canApprove = !requiresConfirmation || confirmed;

  const content = (
    <div
      className={`bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <CategoryIcon category={summary.category} />
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {summary.title}
            </h2>
            <p className="text-sm xl:text-base text-gray-500 dark:text-gray-400">
              {summary.description}
            </p>
          </div>
        </div>
        <StatusBadge level={summary.riskLevel} showScore score={risk.score} />
      </div>

      {/* Simple View - Always visible */}
      <div className="px-5 py-4 space-y-4">
        {/* Primary action summary */}
        {summary.actions.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <ActionIcon action={summary.actions[0]} />
            <div className="flex-1">
              <p className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">
                {summary.actions[0].label}
              </p>
              <p className="text-sm xl:text-base text-gray-600 dark:text-gray-400 font-mono">
                {formatAddress(summary.actions[0].value)}
              </p>
            </div>
          </div>
        )}

        {/* Gas/Fee */}
        <div className="flex items-center justify-between text-sm xl:text-base">
          <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
            Network Fee
            <Tooltip
              content="Fee paid to process this transaction on the network"
              size="xs"
            />
          </span>
          <span
            className={`font-medium ${
              summary.isSponsored
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {formatGasCost(summary)}
          </span>
        </div>
      </div>

      {/* Advanced Toggle */}
      <div className="px-5">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between py-2 text-sm xl:text-base text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <span>{showAdvanced ? 'Hide details' : 'Show details'}</span>
          <span className="text-xs xl:text-sm">{showAdvanced ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Advanced View - Collapsible */}
      {showAdvanced && (
        <div className="px-5 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          {/* All Actions */}
          {summary.actions.length > 1 && (
            <div>
              <h3 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-2">
                All Actions
              </h3>
              <ActionsList actions={summary.actions} variant="compact" />
            </div>
          )}

          {/* Balance Changes */}
          {simulation && (
            <BalancePreview simulation={simulation} variant="detailed" />
          )}

          {/* Safety Checks */}
          {risk.factors.length > 0 && (
            <SafetyChecklist factors={risk.factors} showMitigations />
          )}

          {/* Technical Details */}
          <TechnicalDetails decoded={decoded} />
        </div>
      )}

      {/* Confirmation for critical risk */}
      {requiresConfirmation && (
        <div className="px-5 pb-4">
          <label className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <div>
              <span className="text-sm xl:text-base font-medium text-orange-700 dark:text-orange-300">
                I understand the risks
              </span>
              <p className="text-xs xl:text-sm text-orange-600 dark:text-orange-400 mt-0.5">
                This transaction requires your careful review. Please confirm
                you have read and understood all warnings.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onReject}
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 text-sm xl:text-base font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onApprove}
          disabled={isLoading || !canApprove}
          className={`flex-1 px-4 py-2.5 text-sm xl:text-base font-medium rounded-lg text-white transition-colors ${
            canApprove
              ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
          } disabled:opacity-50`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner />
              Processing...
            </span>
          ) : (
            'Confirm'
          )}
        </button>
      </div>
    </div>
  );

  if (!asModal) {
    return content;
  }

  // Modal wrapper
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative max-w-md w-full max-h-[90vh] overflow-auto">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shadow-lg"
            aria-label="Close"
          >
            ×
          </button>
        )}
        {content}
      </div>
    </div>
  );
}

/**
 * Category icon component
 */
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, string> = {
    transfer: '↗',
    swap: '⇄',
    stake: '🔒',
    governance: '🗳',
    nft: '🖼',
    defi: '📊',
    contract: '📄',
    system: '⚙',
    unknown: '❓',
  };

  return (
    <span className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xl xl:text-2xl">
      {icons[category] || icons.unknown}
    </span>
  );
}

/**
 * Action icon component
 */
function ActionIcon({ action }: { action: { type: string } }) {
  const icons: Record<string, string> = {
    send: '↑',
    receive: '↓',
    swap: '⇄',
    approve: '🛡',
    revoke: '🚫',
    stake: '🔒',
    unstake: '🔓',
    vote: '✓',
    mint: '+',
    burn: '−',
    call: '⌘',
  };

  return (
    <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-lg xl:text-xl">
      {icons[action.type] || '⌘'}
    </span>
  );
}

/**
 * Technical details section
 */
function TechnicalDetails({ decoded }: { decoded: DecodedTx }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-sm xl:text-base text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <span className="flex items-center gap-1">
          Technical Details
          <Tooltip content="Raw transaction data for advanced users" size="xs" />
        </span>
        <span>{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs xl:text-sm">
          <DetailRow label="Chain" value={decoded.chainType.toUpperCase()} />
          <DetailRow label="Chain ID" value={decoded.chainId} />
          <DetailRow
            label="Sender"
            value={formatAddress(decoded.sender)}
            mono
          />
          {decoded.chainType === 'move' && (
            <>
              <DetailRow
                label="Gas Budget"
                value={`${decoded.gasBudget.toString()} MIST`}
              />
              {decoded.sponsor && (
                <DetailRow
                  label="Sponsor"
                  value={formatAddress(decoded.sponsor)}
                  mono
                />
              )}
            </>
          )}
          {decoded.chainType === 'evm' && (
            <>
              <DetailRow label="To" value={formatAddress(decoded.to)} mono />
              <DetailRow
                label="Value"
                value={`${decoded.value.toString()} wei`}
              />
              <DetailRow
                label="Gas Limit"
                value={decoded.gasLimit.toString()}
              />
              {decoded.nonce !== undefined && (
                <DetailRow label="Nonce" value={decoded.nonce.toString()} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Detail row component
 */
function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`text-gray-700 dark:text-gray-300 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Loading spinner component
 */
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
