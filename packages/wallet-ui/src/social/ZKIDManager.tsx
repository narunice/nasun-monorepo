/**
 * ZK-ID Proof Management Panel
 *
 * Displays stored ZK-ID proofs with their status and provides
 * controls for clearing proofs.
 * Only visible in Advanced Mode.
 */

import { useZKIDStore } from '@nasun/wallet';
import type { ZKClaimType, ZKIDProofEntry } from '@nasun/wallet';

export interface ZKIDManagerProps {
  /** Custom class name */
  className?: string;
  /** Compact mode for embedding in Settings */
  compact?: boolean;
}

/**
 * Get display name for claim type
 */
function getClaimTypeName(type: ZKClaimType): string {
  switch (type) {
    case 'age_over':
      return 'Age Verification';
    case 'kyc_completed':
      return 'KYC Status';
    case 'unique_claim':
      return 'Unique Claim';
    case 'custom':
      return 'Custom Proof';
    default:
      return type;
  }
}

/**
 * Get icon for claim type
 */
function ClaimTypeIcon({ type, className = '' }: { type: ZKClaimType; className?: string }) {
  switch (type) {
    case 'age_over':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case 'kyc_completed':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      );
    case 'unique_claim':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
          />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
  }
}

/**
 * Format time since proof was stored
 */
function formatStoredTime(storedAt: number): string {
  const diff = Date.now() - storedAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'Just now';
}

/**
 * Format remaining time until expiration
 */
function formatExpiresIn(expiresAt: number): string {
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) {
    return 'Expired';
  }

  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

export function ZKIDManager({
  className = '',
  compact = false,
}: ZKIDManagerProps) {
  const proofs = useZKIDStore((state) => state.proofs);
  const removeProof = useZKIDStore((state) => state.removeProof);
  const clearAllProofs = useZKIDStore((state) => state.clearAllProofs);

  // Get all proofs as array
  const proofEntries = Object.entries(proofs).filter(
    ([_, entry]) => entry != null
  ) as [ZKClaimType, ZKIDProofEntry][];

  // Check for valid proofs
  const now = Date.now();
  const validProofs = proofEntries.filter(([_, entry]) => entry.proof.expiresAt > now);

  const handleRemove = (type: ZKClaimType) => {
    if (confirm('Remove this proof? You may need to generate it again if required.')) {
      removeProof(type);
    }
  };

  const handleClearAll = () => {
    if (confirm('Remove all ZK-ID proofs? You may need to regenerate them if required.')) {
      clearAllProofs();
    }
  };

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-medium text-gray-900 dark:text-white ${compact ? 'text-xs xl:text-sm' : 'text-sm xl:text-base'}`}>
          ZK-ID Proofs
          {validProofs.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] xl:text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
              {validProofs.length}
            </span>
          )}
        </h3>
        {proofEntries.length > 1 && (
          <button
            onClick={handleClearAll}
            className="text-[10px] xl:text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Empty state */}
      {proofEntries.length === 0 ? (
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
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
            No proofs stored
          </p>
          <p className="text-[10px] xl:text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
            Proofs are generated when required by dApps
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {proofEntries.map(([type, entry]) => {
            const isExpired = entry.proof.expiresAt <= now;

            return (
              <div
                key={type}
                className={`p-2 rounded border ${
                  isExpired
                    ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10'
                    : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Icon */}
                  <div className={`p-1.5 rounded ${
                    isExpired
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  }`}>
                    <ClaimTypeIcon type={type} className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs xl:text-sm font-medium text-gray-900 dark:text-white">
                        {getClaimTypeName(type)}
                      </p>
                      <span className={`px-1 py-0.5 text-[10px] xl:text-xs rounded ${
                        isExpired
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      }`}>
                        {isExpired ? 'Expired' : 'Valid'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] xl:text-xs text-gray-500 dark:text-zinc-400">
                        Stored {formatStoredTime(entry.storedAt)}
                      </span>
                      <span className="text-gray-300 dark:text-zinc-600">|</span>
                      <span className={`text-[10px] xl:text-xs ${
                        isExpired
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-gray-500 dark:text-zinc-400'
                      }`}>
                        {isExpired ? 'Expired' : `Expires in ${formatExpiresIn(entry.proof.expiresAt)}`}
                      </span>
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemove(type)}
                    className="p-1 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                    title="Remove proof"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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

export default ZKIDManager;
