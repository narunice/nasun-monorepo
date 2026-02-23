/**
 * OnChainReceiptContent - Renders on-chain AI Execution Report data (8 categories)
 *
 * Option fields with null values are hidden from display.
 */

import { NETWORK_CONFIG } from '@/config/network';
import { formatNusdc, formatNasun, formatTimestamp, truncateAddress } from '@/utils/format';
import { TierBadge } from '@/components/badges/TierBadge';
import { Section } from './Section';
import { Row } from './Row';
import { CopyableHash } from './CopyableHash';
import { ReceiptFooter } from './ReceiptFooter';
import type { AERData } from '@/features/request/services/aerService';

interface OnChainReceiptContentProps {
  aer: AERData;
  onClose: () => void;
}

function JsonFields({ value }: { value: string }) {
  try {
    const obj = JSON.parse(value);
    if (typeof obj !== 'object' || obj === null) return <span>{value}</span>;
    const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return <span>{value}</span>;
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">{k.replace(/_/g, ' ')}</span>
            <span className="text-[var(--color-text-secondary)] ml-2 text-right">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    );
  } catch {
    return <span>{value}</span>;
  }
}

export function OnChainReceiptContent({ aer, onClose }: OnChainReceiptContentProps) {
  const explorerUrl = `${NETWORK_CONFIG.explorerUrl}/object/${aer.objectId}`;

  return (
    <>
      {/* 1. WHO — Requester */}
      <Section title="Who Requested">
        <Row label="Initiator">{truncateAddress(aer.initiator)}</Row>
        {aer.authorizer !== aer.initiator && (
          <Row label="Authorizer">{truncateAddress(aer.authorizer)}</Row>
        )}
        {aer.delegationPath.length > 0 && (
          <Row label="Delegation">{aer.delegationPath.length} hop{aer.delegationPath.length > 1 ? 's' : ''}</Row>
        )}
      </Section>

      {/* 2. WHO — Executor */}
      <Section title="Who Executed">
        <Row label="Executor">{truncateAddress(aer.executor)}</Row>
        {aer.executorPrincipal && (
          <Row label="Principal">{truncateAddress(aer.executorPrincipal)}</Row>
        )}
        <Row label="Tier">
          <TierBadge tier={aer.executorTier} tierName={aer.executorTierName as 'Open' | 'Bronze' | 'Silver' | 'Gold'} />
        </Row>
        <Row label="Reputation">{aer.executorReputation} / 1000</Row>
        <Row label="Staked">{formatNasun(aer.executorStakeAmount)}</Row>
      </Section>

      {/* 3. HOW MUCH */}
      <Section title="How Much">
        <Row label="Payment">{formatNusdc(aer.paymentAmount)}</Row>
        <Row label="Executor Received">{formatNusdc(aer.executorReceived)}</Row>
        {aer.feeDetail && (
          <Row label="Fee Detail"><JsonFields value={aer.feeDetail} /></Row>
        )}
        {aer.budgetId && (
          <Row label="Budget">{truncateAddress(aer.budgetId)}</Row>
        )}
        {aer.budgetRemaining !== null && (
          <Row label="Budget Remaining">{formatNusdc(aer.budgetRemaining)}</Row>
        )}
      </Section>

      {/* 4. WHAT */}
      <Section title="What Executed">
        <Row label="Model">{aer.modelName}</Row>
        {aer.modelMetadata && (
          <Row label="Metadata"><JsonFields value={aer.modelMetadata} /></Row>
        )}
        <Row label="Time">{(aer.executionTimeMs / 1000).toFixed(2)}s</Row>
        <CopyableHash hash={aer.outputHash} label="Output Hash" />
        <CopyableHash hash={aer.inputHash} label="Input Hash" />
      </Section>

      {/* 5. WHY — only show if any field is populated */}
      {(aer.purpose || aer.policyVersion !== null || aer.constraints) && (
        <Section title="Why">
          {aer.purpose && (
            <Row label="Purpose">{aer.purpose}</Row>
          )}
          {aer.policyVersion !== null && (
            <Row label="Policy">v{aer.policyVersion}</Row>
          )}
          {aer.constraints && (
            <Row label="Constraints"><JsonFields value={aer.constraints} /></Row>
          )}
        </Section>
      )}

      {/* 6. HOW TRUSTWORTHY */}
      <Section title="Trust">
        <Row label="TEE Verified">
          <span className="flex items-center gap-1.5">
            {aer.teeVerified ? 'Yes' : 'No'}
            {aer.teeVerified ? (
              <svg className="w-3.5 h-3.5 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </span>
        </Row>
        {aer.teeAttestationHash && (
          <CopyableHash hash={aer.teeAttestationHash} label="Attestation" />
        )}
      </Section>

      {/* 7. WHEN */}
      <Section title="When">
        <Row label="Requested">{formatTimestamp(aer.requestedAt)}</Row>
        <Row label="Settled">{formatTimestamp(aer.settledAt)}</Row>
        <Row label="Status">
          <span className={aer.status === 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
            {aer.statusName}
          </span>
        </Row>
      </Section>

      {/* 8. CHAIN — only show if any field is populated */}
      {(aer.triggeredBy || aer.triggeredAction) && (
        <Section title="Chain">
          {aer.triggeredBy && (
            <Row label="Triggered By">{truncateAddress(aer.triggeredBy)}</Row>
          )}
          {aer.triggeredAction && (
            <Row label="Triggered Action">{truncateAddress(aer.triggeredAction)}</Row>
          )}
        </Section>
      )}

      {/* Footer */}
      <ReceiptFooter explorerUrl={explorerUrl} onClose={onClose} />
    </>
  );
}
