/**
 * ErrorMessage Component
 *
 * Displays transaction errors in natural language with actionable solutions.
 *
 * UX Principle: Every error should tell users what happened and how to fix it
 *
 * Format:
 * - Friendly title (not error code)
 * - Clear explanation
 * - Actionable next steps
 * - Retry/Learn more buttons
 */

import type { ClearSigningErrorCode } from '@nasun/wallet';
import * as React from 'react';

export interface ErrorMessageProps {
  /** Error code from Clear Signing */
  code: ClearSigningErrorCode;
  /** Optional raw error message (for debugging) */
  rawMessage?: string;
  /** Retry callback */
  onRetry?: () => void;
  /** Learn more callback */
  onLearnMore?: () => void;
  /** Dismiss callback */
  onDismiss?: () => void;
  /** Display mode */
  variant?: 'inline' | 'modal' | 'toast';
  /** Show technical details toggle */
  showDetails?: boolean;
  /** Additional class names */
  className?: string;
}

/** Error display configuration */
interface ErrorConfig {
  title: string;
  description: string;
  suggestion: string;
  icon: string;
  severity: 'warning' | 'error';
}

/** Error code to user-friendly message mapping */
const ERROR_CONFIG: Record<ClearSigningErrorCode, ErrorConfig> = {
  DECODE_FAILED: {
    title: 'Unable to read transaction',
    description:
      "We couldn't understand the transaction format. This might happen with newer or non-standard transactions.",
    suggestion: 'Try refreshing the page or contact the app developer.',
    icon: '📋',
    severity: 'error',
  },
  UNSUPPORTED_CHAIN: {
    title: 'Network not supported',
    description: "This transaction is for a network that isn't currently supported.",
    suggestion: 'Switch to a supported network and try again.',
    icon: '🌐',
    severity: 'error',
  },
  SIMULATION_FAILED: {
    title: 'Preview unavailable',
    description:
      "We couldn't preview what this transaction will do. The transaction may still work.",
    suggestion: 'Proceed with caution or try again later.',
    icon: '👁',
    severity: 'warning',
  },
  SIMULATION_TIMEOUT: {
    title: 'Preview took too long',
    description:
      'The network is slow to respond. The transaction may still work.',
    suggestion: 'You can proceed without preview or try again.',
    icon: '⏱',
    severity: 'warning',
  },
  INVALID_TX_FORMAT: {
    title: 'Something went wrong',
    description: "The transaction data doesn't look right.",
    suggestion: 'Try refreshing the page and starting over.',
    icon: '⚠',
    severity: 'error',
  },
  UNKNOWN_CONTRACT: {
    title: 'Unknown contract',
    description:
      "This transaction interacts with a contract we don't recognize.",
    suggestion: 'Only proceed if you trust the source of this transaction.',
    icon: '❓',
    severity: 'warning',
  },
};

/**
 * Natural language error message component
 *
 * @example
 * // Basic usage
 * <ErrorMessage code="SIMULATION_FAILED" onRetry={handleRetry} />
 *
 * // Toast style
 * <ErrorMessage code="DECODE_FAILED" variant="toast" onDismiss={handleDismiss} />
 */
export function ErrorMessage({
  code,
  rawMessage,
  onRetry,
  onLearnMore,
  onDismiss,
  variant = 'inline',
  showDetails = false,
  className = '',
}: ErrorMessageProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const config = ERROR_CONFIG[code];

  const bgStyles =
    config.severity === 'error'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';

  const iconStyles =
    config.severity === 'error'
      ? 'text-red-500 dark:text-red-400'
      : 'text-yellow-500 dark:text-yellow-400';

  const titleStyles =
    config.severity === 'error'
      ? 'text-red-700 dark:text-red-300'
      : 'text-yellow-700 dark:text-yellow-300';

  if (variant === 'toast') {
    return (
      <div
        className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${bgStyles} ${className}`}
        role="alert"
      >
        <span className={`text-xl ${iconStyles}`}>{config.icon}</span>
        <div className="flex-1">
          <p className={`font-medium ${titleStyles}`}>{config.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {config.suggestion}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border ${bgStyles} overflow-hidden ${className}`}
      role="alert"
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <span className={`text-2xl ${iconStyles}`}>{config.icon}</span>
        <div className="flex-1">
          <h3 className={`font-medium ${titleStyles}`}>{config.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {config.description}
          </p>
        </div>
        {onDismiss && variant === 'inline' && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Suggestion */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">💡</span>
          <span className="text-gray-700 dark:text-gray-300">
            {config.suggestion}
          </span>
        </div>
      </div>

      {/* Actions */}
      {(onRetry || onLearnMore) && (
        <div className="flex items-center gap-3 px-4 pb-4">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
          )}
          {onLearnMore && (
            <button
              onClick={onLearnMore}
              className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Learn More
            </button>
          )}
        </div>
      )}

      {/* Technical details (collapsed by default) */}
      {showDetails && rawMessage && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span>Technical details</span>
            <span>{detailsOpen ? '−' : '+'}</span>
          </button>
          {detailsOpen && (
            <div className="px-4 pb-3">
              <code className="block text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono overflow-x-auto">
                {code}: {rawMessage}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get user-friendly error message for a code
 */
export function getErrorMessage(code: ClearSigningErrorCode): {
  title: string;
  description: string;
  suggestion: string;
} {
  const config = ERROR_CONFIG[code];
  return {
    title: config.title,
    description: config.description,
    suggestion: config.suggestion,
  };
}

/**
 * Generic transaction error type
 * For errors not covered by ClearSigningErrorCode
 */
export interface GenericError {
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * Generic error message component for non-Clear Signing errors
 */
export function GenericErrorMessage({
  error,
  onRetry,
  onDismiss,
  className = '',
}: {
  error: GenericError;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl text-red-500 dark:text-red-400">⚠</span>
        <div className="flex-1">
          <p className="font-medium text-red-700 dark:text-red-300">
            {error.message}
          </p>
          {error.suggestion && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {error.suggestion}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
