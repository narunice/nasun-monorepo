/**
 * Session Key Management Panel
 *
 * Displays active session keys with their permissions, expiration times,
 * and provides controls for revoking sessions.
 * Only visible in Advanced Mode.
 */

import { useState, useEffect } from 'react';
import { useSessionKey } from '@nasun/wallet';
import type { Address } from 'viem';

export interface SessionKeyPanelProps {
  /** Custom class name */
  className?: string;
  /** Compact mode for embedding in Settings */
  compact?: boolean;
}

/**
 * Format remaining time until expiration
 */
function formatTimeRemaining(validUntil: number): string {
  const now = Date.now();
  const remaining = validUntil - now;

  if (remaining <= 0) {
    return 'Expired';
  }

  const seconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Format address for display
 */
function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function SessionKeyPanel({
  className = '',
  compact = false,
}: SessionKeyPanelProps) {
  const {
    sessionKeys,
    revokeSessionKey,
    revokeAllSessionKeys,
    cleanup,
    isAvailable,
    isLoading,
  } = useSessionKey();

  const [timeNow, setTimeNow] = useState(Date.now());

  // Update time every minute to refresh remaining time display
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup expired sessions on mount
  useEffect(() => {
    cleanup();
  }, [cleanup]);

  // Filter out revoked sessions
  const activeSessions = sessionKeys.filter((s) => !s.isRevoked);

  const handleRevoke = (address: Address) => {
    if (confirm('Revoke this session key? The dApp will need to request authorization again.')) {
      revokeSessionKey(address);
    }
  };

  const handleRevokeAll = () => {
    if (confirm('Revoke all session keys? All authorized dApps will need to request authorization again.')) {
      revokeAllSessionKeys();
    }
  };

  // Not available (no smart account)
  if (!isAvailable) {
    return (
      <div className={`${className}`}>
        {!compact && (
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Session Keys
          </h3>
        )}
        <p className="text-xs text-gray-500 dark:text-zinc-400">
          Session keys require a smart account. Connect a smart account to manage sessions.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        {!compact && (
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Session Keys
          </h3>
        )}
        <div className="animate-pulse space-y-2">
          <div className="h-12 bg-gray-200 dark:bg-zinc-700 rounded" />
          <div className="h-12 bg-gray-200 dark:bg-zinc-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-medium text-gray-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
          Session Keys
          {activeSessions.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              {activeSessions.length}
            </span>
          )}
        </h3>
        {activeSessions.length > 1 && (
          <button
            onClick={handleRevokeAll}
            className="text-[10px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            Revoke All
          </button>
        )}
      </div>

      {/* Empty state */}
      {activeSessions.length === 0 ? (
        <div className="text-center py-4">
          <svg
            className="w-8 h-8 text-gray-300 dark:text-zinc-600 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            No active sessions
          </p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
            dApps will request authorization when needed
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeSessions.map((session) => {
            const isExpired = session.expiresAt < timeNow;

            return (
              <div
                key={session.address}
                className={`p-2 rounded border ${
                  isExpired
                    ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10'
                    : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Session name */}
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {session.name || 'Unnamed Session'}
                    </p>

                    {/* Session address */}
                    <p className="text-[10px] font-mono text-gray-500 dark:text-zinc-400">
                      {shortenAddress(session.address)}
                    </p>

                    {/* Permissions count */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-500 dark:text-zinc-400">
                        {session.permissions.length} permission{session.permissions.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-gray-300 dark:text-zinc-600">|</span>
                      <span className={`text-[10px] ${
                        isExpired
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-gray-500 dark:text-zinc-400'
                      }`}>
                        {formatTimeRemaining(session.expiresAt)}
                      </span>
                    </div>
                  </div>

                  {/* Revoke button */}
                  <button
                    onClick={() => handleRevoke(session.address)}
                    className="p-1 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                    title="Revoke session"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SessionKeyPanel;
