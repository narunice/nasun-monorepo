/**
 * LedgerSigningPrompt Component
 *
 * Modal prompt shown while waiting for user to confirm on Ledger device.
 * Uses calm animations and clear instructions (no anxiety-inducing countdown).
 *
 * UX Principle: Waiting should feel calm, not stressful
 *
 * Features:
 * - Device illustration with animation
 * - Clear instruction text
 * - Smooth progress indicator (not countdown)
 * - Cancel option
 */

import * as React from 'react';

export interface LedgerSigningPromptProps {
  /** Whether the prompt is visible */
  isOpen: boolean;
  /** Custom message to display */
  message?: string;
  /** Signing type for context */
  signingType?: 'transaction' | 'message' | 'address';
  /** Timeout in milliseconds (for internal progress, not shown to user) */
  timeout?: number;
  /** Whether user can cancel */
  cancellable?: boolean;
  /** Cancel callback */
  onCancel?: () => void;
  /** Timeout callback */
  onTimeout?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Get default message based on signing type
 */
function getDefaultMessage(type: 'transaction' | 'message' | 'address'): {
  title: string;
  subtitle: string;
} {
  switch (type) {
    case 'transaction':
      return {
        title: 'Check your Ledger',
        subtitle: 'Review and confirm the transaction on your device',
      };
    case 'message':
      return {
        title: 'Sign message',
        subtitle: 'Confirm the message on your Ledger device',
      };
    case 'address':
      return {
        title: 'Verify address',
        subtitle: 'Confirm the address matches on your device',
      };
  }
}

/**
 * Ledger signing prompt modal
 *
 * @example
 * // Basic usage
 * <LedgerSigningPrompt isOpen={isSigning} onCancel={handleCancel} />
 *
 * // For message signing
 * <LedgerSigningPrompt
 *   isOpen={isSigning}
 *   signingType="message"
 *   cancellable
 *   onCancel={handleCancel}
 * />
 */
export function LedgerSigningPrompt({
  isOpen,
  message,
  signingType = 'transaction',
  timeout = 60000,
  cancellable = true,
  onCancel,
  onTimeout,
  className = '',
}: LedgerSigningPromptProps) {
  const [progress, setProgress] = React.useState(0);
  const defaultText = getDefaultMessage(signingType);

  // Progress animation (subtle, not countdown)
  React.useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / timeout) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
        onTimeout?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, timeout, onTimeout]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-sm overflow-hidden">
        {/* Content */}
        <div className="p-8 text-center">
          {/* Device illustration */}
          <div className="mb-6">
            <LedgerDeviceAnimation />
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {message || defaultText.title}
          </h2>

          {/* Subtitle */}
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {defaultText.subtitle}
          </p>

          {/* Progress indicator (subtle, not countdown) */}
          <div className="mt-6 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Waiting indicator */}
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="animate-pulse">●</span>
            <span>Waiting for device...</span>
          </div>
        </div>

        {/* Cancel button */}
        {cancellable && onCancel && (
          <div className="px-8 pb-6">
            <button
              onClick={onCancel}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Animated Ledger device illustration
 */
function LedgerDeviceAnimation() {
  return (
    <div className="relative inline-block">
      {/* Device body */}
      <div className="relative w-32 h-20 bg-gray-800 dark:bg-gray-700 rounded-xl border-2 border-gray-600 dark:border-gray-500 flex items-center justify-center">
        {/* Screen */}
        <div className="w-24 h-10 bg-black rounded flex items-center justify-center">
          {/* Screen content - animated checkmark prompt */}
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-xl animate-pulse">✓</span>
            <span className="text-white text-xs">Confirm</span>
          </div>
        </div>

        {/* USB connector */}
        <div className="absolute -right-4 w-4 h-5 bg-gray-600 dark:bg-gray-500 rounded-r border-2 border-l-0 border-gray-500 dark:border-gray-400" />

        {/* Buttons */}
        <div className="absolute top-1 left-2 w-2 h-2 bg-gray-600 dark:bg-gray-500 rounded-full" />
        <div className="absolute top-1 right-2 w-2 h-2 bg-gray-600 dark:bg-gray-500 rounded-full animate-pulse" />
      </div>

      {/* Glow effect */}
      <div className="absolute inset-0 rounded-xl bg-blue-500/20 animate-pulse -z-10 blur-xl" />

      {/* Finger tap indicator */}
      <div className="absolute -top-3 right-0">
        <div className="w-6 h-6 bg-blue-500/30 rounded-full animate-ping" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg">👆</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline signing indicator (for non-modal use cases)
 */
export function LedgerSigningIndicator({
  signingType = 'transaction',
  className = '',
}: {
  signingType?: 'transaction' | 'message' | 'address';
  className?: string;
}) {
  const text = getDefaultMessage(signingType);

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 ${className}`}
    >
      <div className="animate-pulse">
        <span className="text-2xl">🔑</span>
      </div>
      <div>
        <p className="font-medium text-blue-700 dark:text-blue-300">
          {text.title}
        </p>
        <p className="text-sm text-blue-600 dark:text-blue-400">
          {text.subtitle}
        </p>
      </div>
    </div>
  );
}
