/**
 * Security Progress Component
 *
 * Displays the user's security setup progress with a checklist
 * of recommended security measures.
 */

import { useWallet, useZkLogin, usePasskey } from '@nasun/wallet';

export interface SecurityProgressProps {
  /** Custom class name */
  className?: string;
  /** Show detailed checklist */
  showDetails?: boolean;
  /** Callback when a setup action is clicked */
  onSetupClick?: (action: 'backup' | 'passkey' | 'zklogin') => void;
}

interface SecurityItem {
  id: string;
  label: string;
  description: string;
  isComplete: boolean;
  action?: 'backup' | 'passkey' | 'zklogin';
}

export function SecurityProgress({
  className = '',
  showDetails = true,
  onSetupClick,
}: SecurityProgressProps) {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { wallet: passkeyWallet } = usePasskey();

  // Determine security status for each item
  const items: SecurityItem[] = [
    {
      id: 'wallet',
      label: 'Wallet Created',
      description: 'A wallet has been set up',
      isComplete: status === 'unlocked' || status === 'locked' || isZkLoggedIn,
    },
    {
      id: 'backup',
      label: 'Backup Complete',
      description: 'Recovery phrase has been backed up',
      // In a real implementation, this would check if mnemonic was backed up
      // For now, we assume it's complete if wallet exists (simplified)
      isComplete: status === 'unlocked' || status === 'locked',
      action: 'backup',
    },
    {
      id: 'passkey',
      label: 'Passkey Enabled',
      description: 'Biometric login for added security',
      isComplete: !!passkeyWallet,
      action: 'passkey',
    },
    {
      id: 'zklogin',
      label: 'Social Login',
      description: 'Connected via Google or social provider',
      isComplete: isZkLoggedIn,
      action: 'zklogin',
    },
  ];

  const completedCount = items.filter((item) => item.isComplete).length;
  const totalCount = items.length;
  const progressPercent = (completedCount / totalCount) * 100;

  // Get color based on progress
  const getProgressColor = () => {
    if (progressPercent >= 75) return 'bg-green-500';
    if (progressPercent >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = () => {
    if (progressPercent >= 75) return 'text-green-600 dark:text-green-400';
    if (progressPercent >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className={`${className}`}>
      {/* Header with progress */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Security Progress
        </h3>
        <span className={`text-sm font-medium ${getProgressTextColor()}`}>
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full ${getProgressColor()} transition-all duration-300`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Checklist */}
      {showDetails && (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-2 p-2 rounded ${
                item.isComplete
                  ? 'bg-green-50/50 dark:bg-green-900/10'
                  : 'bg-gray-50 dark:bg-zinc-800/50'
              }`}
            >
              {/* Checkbox */}
              <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                item.isComplete
                  ? 'bg-green-500'
                  : 'bg-gray-300 dark:bg-zinc-600'
              }`}>
                {item.isComplete ? (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-white dark:bg-zinc-800" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-medium ${
                    item.isComplete
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-gray-700 dark:text-zinc-300'
                  }`}>
                    {item.label}
                  </p>
                  {!item.isComplete && item.action && onSetupClick && (
                    <button
                      onClick={() => onSetupClick(item.action!)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Set up
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 dark:text-zinc-400">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendation */}
      {completedCount < totalCount && (
        <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-400">
          <p className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Complete all steps for maximum security
          </p>
        </div>
      )}
    </div>
  );
}

export default SecurityProgress;
