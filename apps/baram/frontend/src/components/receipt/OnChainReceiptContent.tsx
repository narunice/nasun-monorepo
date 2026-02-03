/**
 * OnChainReceiptContent - Renders on-chain ExecutionComplianceRecord data
 */

import { TEE_TYPES, NETWORK_CONFIG, type TeeType } from '@/config/network';
import { formatNusdc, formatNasun, formatTimestamp } from '@/utils/format';
import { TierBadge } from '@/components/badges/TierBadge';
import { Section } from './Section';
import { Row } from './Row';
import { CopyableHash } from './CopyableHash';
import { ReceiptFooter } from './ReceiptFooter';
import type { ECRData } from '@/features/request/services/ecrService';

interface OnChainReceiptContentProps {
  ecr: ECRData;
  onClose: () => void;
}

export function OnChainReceiptContent({ ecr, onClose }: OnChainReceiptContentProps) {
  const explorerUrl = `${NETWORK_CONFIG.explorerUrl}/object/${ecr.objectId}`;

  return (
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
      <ReceiptFooter explorerUrl={explorerUrl} onClose={onClose} />
    </>
  );
}
