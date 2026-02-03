/**
 * AttestationDisplay - Shows TEE attestation info before payment
 */

import { useState } from 'react';
import { TEE_TYPES, type TeeType } from '@/config/network';
import { truncateHash, formatTimestamp } from '@/utils/format';
import type { AttestationState } from '../hooks/useAttestation';

interface AttestationDisplayProps {
  teeType: number;
  attestation: AttestationState;
}

export function AttestationDisplay({ teeType, attestation }: AttestationDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  // Non-TEE executor
  if (teeType === 0) {
    return (
      <div className="p-3 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium text-[var(--color-warning)]">
            No TEE Protection
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          This executor does not use TEE. Your prompt may be visible to the operator.
        </p>
      </div>
    );
  }

  // Loading state
  if (attestation.isLoading) {
    return (
      <div className="p-3 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-[var(--color-text-muted)]">
            Fetching attestation...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (attestation.error) {
    return (
      <div className="p-3 rounded-lg bg-[var(--color-error)]/10 border border-[var(--color-error)]/30">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm font-medium text-[var(--color-error)]">
            Attestation Failed
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          {attestation.error}
        </p>
      </div>
    );
  }

  // No attestation data
  if (!attestation.attestation) {
    return null;
  }

  const { moduleId, pcr0, timestamp } = attestation.attestation;
  const { isVerified, verificationMessage } = attestation;

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isVerified
          ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/30'
          : 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/30'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isVerified ? (
            <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          <span className={`text-sm font-medium ${isVerified ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
            {isVerified ? 'TEE Verified' : 'TEE Unverified'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {/* Summary (always visible) */}
      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span>{TEE_TYPES[teeType as TeeType] || 'Unknown'}</span>
        <span className="text-[var(--color-text-muted)]">|</span>
        <span>{moduleId}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">PCR0 (Code Hash)</span>
            <span
              className="font-mono text-[var(--color-text-secondary)] cursor-pointer"
              title={pcr0}
              onClick={() => { try { navigator.clipboard.writeText(pcr0); } catch { /* noop */ } }}
            >
              {truncateHash(pcr0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Module ID</span>
            <span className="text-[var(--color-text-secondary)]">{moduleId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Attestation Time</span>
            <span className="text-[var(--color-text-secondary)]">{formatTimestamp(timestamp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Verification</span>
            <span className={isVerified ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>
              {verificationMessage}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
