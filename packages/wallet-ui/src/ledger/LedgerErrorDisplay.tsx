/**
 * LedgerErrorDisplay Component
 *
 * Displays Ledger hardware wallet errors in natural language with solutions.
 *
 * UX Principle: Every error tells users what happened and how to fix it
 *
 * Format:
 * - Device illustration (when helpful)
 * - Friendly error title
 * - Clear next steps
 * - Retry/Help buttons
 */

import type { LedgerErrorCode } from '@nasun/wallet';
import * as React from 'react';

export interface LedgerErrorDisplayProps {
  /** Error code */
  code: LedgerErrorCode;
  /** Raw error message (for debugging) */
  rawMessage?: string;
  /** Retry callback */
  onRetry?: () => void;
  /** Dismiss callback */
  onDismiss?: () => void;
  /** Help callback */
  onHelp?: () => void;
  /** Display mode */
  variant?: 'inline' | 'card' | 'toast';
  /** Show device illustration */
  showDevice?: boolean;
  /** Additional class names */
  className?: string;
}

/** Error display configuration */
interface ErrorConfig {
  title: string;
  description: string;
  solution: string;
  icon: string;
  severity: 'info' | 'warning' | 'error';
  showDeviceHint: boolean;
}

/** Error code to user-friendly message mapping */
const ERROR_CONFIG: Record<LedgerErrorCode, ErrorConfig> = {
  USER_REJECTED: {
    title: 'Transaction cancelled',
    description: 'You cancelled the transaction on your Ledger device.',
    solution: 'You can try again anytime.',
    icon: '✕',
    severity: 'info',
    showDeviceHint: false,
  },
  DEVICE_LOCKED: {
    title: 'Device is locked',
    description: 'Your Ledger device is locked.',
    solution: 'Enter your PIN on your Ledger to unlock it.',
    icon: '🔒',
    severity: 'warning',
    showDeviceHint: true,
  },
  APP_NOT_OPEN: {
    title: 'Wallet app not open',
    description: "The required app isn't open on your Ledger.",
    solution: 'Open the Sui/Nasun app on your Ledger device.',
    icon: '📱',
    severity: 'warning',
    showDeviceHint: true,
  },
  DEVICE_DISCONNECTED: {
    title: 'Device disconnected',
    description: 'Your Ledger device was disconnected.',
    solution: 'Reconnect your Ledger and try again.',
    icon: '🔌',
    severity: 'error',
    showDeviceHint: false,
  },
  TRANSPORT_ERROR: {
    title: 'Connection issue',
    description: "We couldn't communicate with your Ledger.",
    solution: 'Try unplugging and reconnecting your device.',
    icon: '⚠',
    severity: 'error',
    showDeviceHint: false,
  },
  INVALID_PATH: {
    title: 'Invalid account',
    description: "The account path isn't valid for this device.",
    solution: 'Try selecting a different account.',
    icon: '❓',
    severity: 'error',
    showDeviceHint: false,
  },
  UNSUPPORTED_OPERATION: {
    title: 'Not supported',
    description: "This operation isn't supported by your Ledger app.",
    solution: 'Make sure your Ledger app is up to date.',
    icon: '⛔',
    severity: 'error',
    showDeviceHint: false,
  },
  BROWSER_NOT_SUPPORTED: {
    title: 'Browser not compatible',
    description: "Your browser doesn't support hardware wallets.",
    solution: 'Use Chrome, Edge, or Brave browser instead.',
    icon: '🌐',
    severity: 'error',
    showDeviceHint: false,
  },
  UNKNOWN: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred.',
    solution: 'Try disconnecting and reconnecting your Ledger.',
    icon: '⚠',
    severity: 'error',
    showDeviceHint: false,
  },
};

/**
 * Ledger error display component
 *
 * @example
 * // Basic usage
 * <LedgerErrorDisplay code="DEVICE_LOCKED" onRetry={handleRetry} />
 *
 * // Toast style
 * <LedgerErrorDisplay code="USER_REJECTED" variant="toast" onDismiss={handleDismiss} />
 */
export function LedgerErrorDisplay({
  code,
  rawMessage,
  onRetry,
  onDismiss,
  onHelp,
  variant = 'card',
  showDevice = true,
  className = '',
}: LedgerErrorDisplayProps) {
  const [showDetails, setShowDetails] = React.useState(false);
  const config = ERROR_CONFIG[code];

  const bgStyles = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    warning:
      'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  }[config.severity];

  const iconStyles = {
    info: 'text-blue-500 dark:text-blue-400',
    warning: 'text-yellow-500 dark:text-yellow-400',
    error: 'text-red-500 dark:text-red-400',
  }[config.severity];

  const titleStyles = {
    info: 'text-blue-700 dark:text-blue-300',
    warning: 'text-yellow-700 dark:text-yellow-300',
    error: 'text-red-700 dark:text-red-300',
  }[config.severity];

  if (variant === 'toast') {
    return (
      <div
        className={`flex items-start gap-3 p-4 rounded-md border shadow-lg ${bgStyles} ${className}`}
        role="alert"
      >
        <span className={`text-xl ${iconStyles}`}>{config.icon}</span>
        <div className="flex-1">
          <p className={`font-medium ${titleStyles}`}>{config.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {config.solution}
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
      className={`rounded-xl border ${bgStyles} overflow-hidden ${className}`}
      role="alert"
    >
      {/* Device illustration */}
      {showDevice && config.showDeviceHint && (
        <div className="flex justify-center py-6 bg-gradient-to-b from-gray-100 to-white dark:from-gray-800 dark:to-gray-900">
          <LedgerDeviceIllustration action={code} />
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className={`text-2xl ${iconStyles}`}>{config.icon}</span>
          <div className="flex-1">
            <h3 className={`font-semibold ${titleStyles}`}>{config.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {config.description}
            </p>
          </div>
        </div>

        {/* Solution */}
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">💡</span>
          <span className="text-gray-700 dark:text-gray-300">
            {config.solution}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-5">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
          )}
          {onHelp && (
            <button
              onClick={onHelp}
              className="px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Need Help?
            </button>
          )}
        </div>

        {/* Technical details (for debugging) */}
        {rawMessage && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-between w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <span>Technical details</span>
              <span>{showDetails ? '−' : '+'}</span>
            </button>
            {showDetails && (
              <code className="block mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono overflow-x-auto">
                {code}: {rawMessage}
              </code>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Simple Ledger device illustration component
 */
function LedgerDeviceIllustration({
  action,
}: {
  action: LedgerErrorCode;
}) {
  const deviceColor =
    action === 'DEVICE_LOCKED' ? 'text-yellow-400' : 'text-gray-400';
  const screenContent =
    action === 'DEVICE_LOCKED'
      ? '🔒'
      : action === 'APP_NOT_OPEN'
        ? '📱'
        : '⬜';

  return (
    <div className="relative">
      {/* Device body */}
      <div
        className={`w-28 h-16 rounded-md border-2 ${deviceColor} bg-white dark:bg-gray-800 flex items-center justify-center relative`}
      >
        {/* Screen */}
        <div className="w-20 h-8 bg-gray-900 dark:bg-black rounded flex items-center justify-center text-white text-lg">
          {screenContent}
        </div>

        {/* USB connector */}
        <div
          className={`absolute -right-3 w-3 h-4 border-2 ${deviceColor} bg-white dark:bg-gray-800 rounded-r`}
        />
      </div>

      {/* Action indicator */}
      {action === 'DEVICE_LOCKED' && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-white text-xs">
          !
        </div>
      )}
    </div>
  );
}

/**
 * Get user-friendly error message for a Ledger error code
 */
export function getLedgerErrorMessage(code: LedgerErrorCode): {
  title: string;
  description: string;
  solution: string;
} {
  const config = ERROR_CONFIG[code];
  return {
    title: config.title,
    description: config.description,
    solution: config.solution,
  };
}
