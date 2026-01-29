/**
 * ECRReceipt - Modal displaying ExecutionComplianceRecord as a receipt
 */

import { useECR } from '../hooks/useECR';
import { TierBadge } from '@/components/badges/TierBadge';
import { NETWORK_CONFIG, TEE_TYPES, type TeeType } from '@/config/network';

interface ECRReceiptProps {
  requestId: number;
  onClose: () => void;
}

function truncateHash(hash: string, chars = 8): string {
  if (!hash || hash.length <= chars * 2 + 2) return hash || '-';
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function formatNusdc(amount: number): string {
  return `${(amount / 1e6).toFixed(2)} NUSDC`;
}

function formatNasun(amount: number): string {
  return `${(amount / 1e9).toLocaleString('en-US')} NASUN`;
}

function formatTimestamp(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CopyableHash({ hash, label }: { hash: string; label: string }) {
  const handleCopy = () => {
    if (hash) navigator.clipboard.writeText(hash);
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <button
        onClick={handleCopy}
        className="font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
        title={hash || 'No data'}
      >
        {truncateHash(hash)}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--color-border)] pt-3 mt-3">
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-1.5 text-sm">
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[var(--color-text-secondary)]">{children}</span>
    </div>
  );
}

export function ECRReceipt({ requestId, onClose }: ECRReceiptProps) {
  const { ecr, isLoading, error } = useECR(requestId);

  const explorerUrl = ecr
    ? `${NETWORK_CONFIG.explorerUrl}/object/${ecr.objectId}`
    : null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Execution Compliance Record
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Request #{requestId}
          </p>
        </div>

        {/* Content */}
        <div className="px-5 pb-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-2 text-sm text-[var(--color-text-muted)]">Loading record...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-error)]">Failed to load record</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{error}</p>
            </div>
          )}

          {!isLoading && !error && !ecr && (
            <div className="py-8 text-center">
              <svg className="w-8 h-8 mx-auto text-[var(--color-text-muted)] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-[var(--color-text-muted)]">Receipt not yet available</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                The compliance record is created after settlement.
              </p>
            </div>
          )}

          {ecr && (
            <>
              {/* Execution */}
              <Section title="Execution">
                <Row label="Model">{ecr.model}</Row>
                <Row label="Time">{(ecr.executionTimeMs / 1000).toFixed(2)}s</Row>
                <CopyableHash hash={ecr.resultHash} label="Result Hash" />
                <CopyableHash hash={ecr.promptHash} label="Prompt Hash" />
              </Section>

              {/* Environment */}
              <Section title="Environment">
                <Row label="TEE">
                  <span className="flex items-center gap-1.5">
                    {TEE_TYPES[ecr.teeType as TeeType] || 'None'}
                    {ecr.pcrVerified ? (
                      <svg className="w-3.5 h-3.5 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : ecr.teeType > 0 ? (
                      <svg className="w-3.5 h-3.5 text-[var(--color-error)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : null}
                  </span>
                </Row>
                {ecr.teeType > 0 && (
                  <>
                    <Row label="PCR Verified">{ecr.pcrVerified ? 'Yes' : 'No'}</Row>
                    <Row label="Baseline Version">v{ecr.pcrBaselineVersion}</Row>
                    <CopyableHash hash={ecr.attestationHash} label="Attestation" />
                    <CopyableHash hash={ecr.pcr0} label="PCR0" />
                  </>
                )}
              </Section>

              {/* Executor Snapshot */}
              <Section title="Executor Snapshot">
                <Row label="Tier">
                  <TierBadge tier={ecr.executorTier} tierName={ecr.executorTierName as typeof ecr.executorTierName & ('Open' | 'Bronze' | 'Silver' | 'Gold')} />
                </Row>
                <Row label="Reputation">{ecr.executorReputation} / 1000</Row>
                <Row label="Staked">{formatNasun(ecr.executorStakeAmount)}</Row>
                <Row label="Slash Count">{ecr.executorSlashCount}</Row>
              </Section>

              {/* Settlement */}
              <Section title="Settlement">
                <Row label="Payment">{formatNusdc(ecr.paymentAmount)}</Row>
                <Row label="Created">{formatTimestamp(ecr.requestCreatedAt)}</Row>
                <Row label="Settled">{formatTimestamp(ecr.settledAt)}</Row>
              </Section>

              {/* Policy */}
              <Section title="Policy">
                <Row label="Version">v{ecr.policyVersion}</Row>
                <Row label="Timeout">{Math.round(ecr.timeoutMs / 1000 / 60)} min</Row>
                <Row label="Min Price">{formatNusdc(ecr.minPrice)}</Row>
              </Section>

              {/* Footer */}
              <div className="border-t border-[var(--color-border)] pt-4 mt-4 flex items-center justify-between">
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-baram-1 hover:text-baram-2 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View on Explorer
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors px-3 py-1 rounded border border-[var(--color-border)]"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
