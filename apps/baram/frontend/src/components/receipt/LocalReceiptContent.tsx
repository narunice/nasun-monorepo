/**
 * LocalReceiptContent - Renders local execution metadata when on-chain ECR is unavailable
 */

import { TEE_TYPES, type TeeType } from '@/config/network';
import { Section } from './Section';
import { Row } from './Row';
import { CopyableHash } from './CopyableHash';
import { ReceiptFooter } from './ReceiptFooter';
import { NETWORK_CONFIG } from '@/config/network';

interface LocalMetadata {
  requestId?: number;
  executionTimeMs?: number;
  teeVerified?: boolean;
  txDigest?: string;
  resultHash?: string;
  teeType?: number;
  pcr0?: string;
  attestationVerified?: boolean;
}

interface LocalReceiptContentProps {
  metadata: LocalMetadata;
  onClose: () => void;
}

export function LocalReceiptContent({ metadata, onClose }: LocalReceiptContentProps) {
  return (
    <>
      {/* Local Data Notice */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] mb-1">
        <svg className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-[var(--color-text-muted)]">
          On-chain record pending. Showing local execution data.
        </p>
      </div>

      {/* Execution */}
      <Section title="Execution">
        {metadata.executionTimeMs !== undefined && (
          <Row label="Time">{(metadata.executionTimeMs / 1000).toFixed(2)}s</Row>
        )}
        {metadata.resultHash && (
          <CopyableHash hash={metadata.resultHash} label="Result Hash" />
        )}
      </Section>

      {/* Environment */}
      {metadata.teeType !== undefined && metadata.teeType > 0 && (
        <Section title="Environment">
          <Row label="TEE">
            <span className="flex items-center gap-1.5">
              {TEE_TYPES[metadata.teeType as TeeType] || `Type ${metadata.teeType}`}
              {metadata.attestationVerified !== undefined && (
                metadata.attestationVerified ? (
                  <svg className="w-3.5 h-3.5 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-[var(--color-error)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )
              )}
            </span>
          </Row>
          {metadata.attestationVerified !== undefined && (
            <Row label="Attestation">{metadata.attestationVerified ? 'Verified' : 'Unverified'}</Row>
          )}
          {metadata.pcr0 && (
            <CopyableHash hash={metadata.pcr0} label="PCR0" />
          )}
        </Section>
      )}

      {/* Settlement Status */}
      <Section title="Settlement">
        <Row label="Status">
          {metadata.txDigest ? (
            <span className="text-[var(--color-success)]">Settled</span>
          ) : (
            <span className="text-[var(--color-text-muted)]">Pending</span>
          )}
        </Row>
        {metadata.txDigest && (
          <CopyableHash hash={metadata.txDigest} label="TX Digest" />
        )}
      </Section>

      {/* Footer */}
      <ReceiptFooter
        explorerUrl={metadata.txDigest ? `${NETWORK_CONFIG.explorerUrl}/tx/${metadata.txDigest}` : undefined}
        onClose={onClose}
      />
    </>
  );
}
