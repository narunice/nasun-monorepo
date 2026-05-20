/**
 * ResultViewerModal — narrative-first AER viewer.
 *
 * AER is Nasun AI's compliance/trust selling point: every AI decision and
 * its on-chain execution is recorded as a tamper-evident audit trail. The
 * 2026-05-20 review of the original modal flagged it as too schema-heavy
 * for that role — raw hex hashes and 11 sub-struct names communicated
 * "this is a debug view" instead of "this is verifiable AI compliance".
 *
 * This rewrite leads with story:
 *   1. Hero — what happened, did it succeed, when, in plain English.
 *   2. Trust signals — payload hash verified, executor tier, TEE status,
 *      explorer link. The proof points a VC scans first.
 *   3. AI reasoning — model + prompt hash + strategy, with a one-line
 *      replay invariant ("same inputs → same outputs").
 *   4. Cost & timing — fee, budget remaining, exec time.
 *   5. Lineage — intent → parent → execution chain, who triggered it.
 *   6. Raw audit — collapsible expert details (payload hash, schema, all
 *      32-byte ids) for compliance officers and protocol developers.
 *
 * Hash verification, copy/download, and the cognition-result text body
 * are preserved; only the layout, copy, and hierarchy changed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAerResult } from '../../hooks/useAerResult';
import type { AERRecord } from '../../hooks/useAerRecords';
import { formatTimeDetailed } from '../../utils/format';
import { NETWORK_CONFIG } from '../../services/network';

interface ResultViewerModalProps {
  requestId: number;
  record: AERRecord;
  authorizer: string;
  onClose: () => void;
}

async function verifyResultHash(result: string, expectedHash: string): Promise<boolean> {
  const data = new TextEncoder().encode(result);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex === expectedHash;
}

// ===== Display helpers =====

function shortHash(hex: string | null | undefined, head = 6, tail = 4): string {
  if (!hex) return '-';
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function eventClassMeta(cls?: number): { label: string; tone: string } {
  switch (cls) {
    case 1: return { label: 'Cognition', tone: 'text-sky-400 bg-sky-500/10 border-sky-500/30' };
    case 2: return { label: 'Execution', tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    case 3: return { label: 'Settlement', tone: 'text-violet-400 bg-violet-500/10 border-violet-500/30' };
    case 4: return { label: 'Observation', tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
    case 5: return { label: 'Coordination', tone: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30' };
    default: return { label: cls == null ? '-' : `Class ${cls}`, tone: 'text-uju-secondary bg-uju-card border-uju-border' };
  }
}

function outcomeMeta(o?: number): { label: string; tone: string } {
  switch (o) {
    case 1: return { label: 'Success', tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    case 2: return { label: 'Hold', tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    case 3: return { label: 'Failure', tone: 'text-red-400 bg-red-500/10 border-red-500/30' };
    default: return { label: '-', tone: 'text-uju-secondary bg-uju-card border-uju-border' };
  }
}

// Triggered-by enum mirrors the on-chain TriggerType in baram-sdk's
// wake-trigger module. Off-by-one mislabelling here would tell compliance
// reviewers the wrong cause for an event, so the values are deliberately
// pinned to the SDK constants rather than re-numbered for UI niceness.
function triggerLabel(t?: number): string {
  switch (t) {
    case 1: return 'Heartbeat (autonomous cycle)';
    case 2: return 'User message';
    case 3: return 'Price alert';
    case 4: return 'Manual session';
    case 5: return 'Coordination';
    default: return t == null ? '-' : `Trigger ${t}`;
  }
}

function tierLabel(t?: number): string {
  switch (t) {
    case 0: return 'Open';
    case 1: return 'Bronze';
    case 2: return 'Silver';
    case 3: return 'Gold';
    default: return '-';
  }
}

function formatNusdc(raw?: number): string {
  if (raw == null || !Number.isFinite(raw)) return '-';
  return `${(raw / 1e6).toFixed(4)} NUSDC`;
}

function formatMs(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Compact action description: prefer the LLM-authored summary if present,
// otherwise synthesize from action_type + outcome so the hero never reads
// "trade.swap.v1 success" (Move-internal language).
function heroActionDescription(record: AERRecord): string {
  if (record.actionSummary && record.actionSummary.length > 0) return record.actionSummary;
  const at = record.actionType ?? '';
  if (at.startsWith('trade.swap')) return 'On-chain swap on Pado DEX';
  if (at.startsWith('cognition.')) return 'AI reasoning step (no on-chain trade)';
  if (at.startsWith('analysis')) return 'Autonomous analysis cycle';
  if (at.startsWith('noop')) return 'No-op cycle (LLM chose HOLD)';
  if (at) return at;
  if (record.purpose) return record.purpose;
  // Last-resort generic. Use the event-class label so a VC scanning a
  // first AER never sees the opaque "AI execution" placeholder.
  return `${eventClassMeta(record.eventClass).label} step`;
}

// ===== Primitive UI =====

function CopyableHash({ hex, label }: { hex: string | null | undefined; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!hex) return <span className="text-uju-secondary/70 font-mono">-</span>;
  const onCopy = () => {
    navigator.clipboard
      .writeText(hex)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={`${label ? `${label}: ` : ''}${hex} (click to copy)`}
      className="inline-flex items-center gap-1.5 font-mono text-sm text-white/90 hover:text-pado-2 transition-colors"
    >
      <span className="truncate">{shortHash(hex)}</span>
      <span className="text-sm text-uju-secondary shrink-0">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-sm font-medium ${tone}`}>
      {children}
    </span>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-uju-border/60 bg-uju-card/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase">{title}</h3>
        {hint && <p className="text-sm text-uju-secondary/70">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-uju-secondary shrink-0">{label}</span>
      <span className="text-white text-right min-w-0 truncate">{children}</span>
    </div>
  );
}

// ===== Hero =====

function HeroSection({ record }: { record: AERRecord }) {
  const evMeta = eventClassMeta(record.eventClass);
  const ocMeta = outcomeMeta(record.actionOutcome);
  const description = heroActionDescription(record);

  return (
    <section className="rounded-xl border border-pado-2/30 bg-gradient-to-br from-pado-2/10 to-uju-card/40 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={evMeta.tone}>{evMeta.label}</Badge>
          {record.actionOutcome !== undefined && (
            <Badge tone={ocMeta.tone}>{ocMeta.label}</Badge>
          )}
        </div>
        <span className="text-sm text-uju-secondary/70">
          {formatTimeDetailed(record.settledAt)}
        </span>
      </div>
      <p className="text-base text-white leading-relaxed">{description}</p>
      {record.actionType && (
        <p className="text-sm text-uju-secondary/70 font-mono">{record.actionType}</p>
      )}
    </section>
  );
}

// ===== Trust signals =====

function TrustSection({
  record,
  hashValid,
}: {
  record: AERRecord;
  hashValid: boolean | null;
}) {
  return (
    <SectionCard
      title="Trust signals"
      hint="Cryptographically verifiable, immutable on-chain record"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Row label="Payload hash">
          <CopyableHash hex={record.payloadHash} label="payload hash" />
        </Row>
        <Row label="Result hash">
          {hashValid === null ? (
            <span className="text-uju-secondary/70">-</span>
          ) : hashValid ? (
            <Badge tone="text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
              Verified
            </Badge>
          ) : (
            <Badge tone="text-red-400 bg-red-500/10 border-red-500/30">
              Mismatch
            </Badge>
          )}
        </Row>
        <Row label="Executor tier">
          <span>{tierLabel(record.executorTier)}</span>
        </Row>
        <Row label="TEE attestation">
          {record.teeVerified ? (
            <Badge tone="text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
              Verified
            </Badge>
          ) : (
            <span className="text-uju-secondary/80" title="v1 ships without TEE; attestation is on the roadmap">
              Not in v1 baseline
            </span>
          )}
        </Row>
      </div>
    </SectionCard>
  );
}

// ===== AI reasoning =====

function AISection({ record }: { record: AERRecord }) {
  return (
    <SectionCard
      title="AI reasoning"
      hint="Prompt and response bytes are hash-committed on chain for cryptographic attestation"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Row label="Model">
          <span className="font-mono text-sm">{record.modelName || record.modelVersion || '-'}</span>
        </Row>
        <Row label="Prompt hash">
          <CopyableHash hex={record.promptTemplateHash} label="prompt hash" />
        </Row>
        <Row label="Strategy">
          <span>{record.strategyId ?? '-'}</span>
        </Row>
        <Row label="Market snapshot">
          <CopyableHash hex={record.marketSnapshotHash} label="market snapshot hash" />
        </Row>
      </div>
    </SectionCard>
  );
}

// ===== Cost & timing =====

function CostSection({ record }: { record: AERRecord }) {
  return (
    <SectionCard
      title="Cost & timing"
      hint="Paid from on-chain inference balance"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Row label="Inference fee">
          <span className="font-mono">{formatNusdc(record.paymentAmount)}</span>
        </Row>
        <Row label="Budget remaining">
          <span className="font-mono">{formatNusdc(record.budgetRemaining)}</span>
        </Row>
        <Row label="Execution time">
          <span>{formatMs(record.executionTimeMs)}</span>
        </Row>
        <Row label="Requested">
          <span className="text-uju-secondary/80">
            {record.requestedAt ? formatTimeDetailed(record.requestedAt) : '-'}
          </span>
        </Row>
      </div>
    </SectionCard>
  );
}

// ===== Lineage =====

function LineageSection({ record }: { record: AERRecord }) {
  const triggerText = triggerLabel(record.triggeredByType);
  return (
    <SectionCard
      title="Lineage"
      hint="Intent chain links every decision to its origin"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Row label="Intent id">
          <CopyableHash hex={record.intentId} label="intent id" />
        </Row>
        <Row label="Parent intent">
          {record.parentIntentId ? (
            <CopyableHash hex={record.parentIntentId} label="parent intent" />
          ) : (
            <span className="text-uju-secondary/70">(chain root)</span>
          )}
        </Row>
        <Row label="Execution #">
          <span>{record.executionId ?? '-'}</span>
        </Row>
        <Row label="Triggered by">
          <span>{triggerText}</span>
        </Row>
        <Row label="Authorizer">
          <CopyableHash hex={record.authorizer} label="authorizer wallet" />
        </Row>
        {record.capabilityId && (
          <Row label="Capability">
            <CopyableHash hex={record.capabilityId} label="capability id" />
          </Row>
        )}
      </div>
    </SectionCard>
  );
}

// ===== Raw audit (collapsible) =====

function RawAuditSection({ record }: { record: AERRecord }) {
  const [open, setOpen] = useState(false);
  const contentId = `aer-raw-audit-${record.id}`;
  return (
    <section className="rounded-xl border border-uju-border/60 bg-uju-card/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label="Raw audit details, expert view"
      >
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Raw audit</h3>
          <p className="text-sm text-uju-secondary/70">For compliance and protocol developers</p>
        </div>
        <span className="text-uju-secondary text-sm" aria-hidden="true">{open ? '-' : '+'}</span>
      </button>
      {open && (
        <div id={contentId} className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-uju-border/40 pt-3">
          <Row label="AER record id">
            <CopyableHash hex={record.id} label="AER object id" />
          </Row>
          <Row label="Executor address">
            <CopyableHash hex={record.executor} label="executor address" />
          </Row>
          <Row label="Budget id">
            {record.budgetId ? (
              <CopyableHash hex={record.budgetId} label="budget id" />
            ) : (
              <span className="text-uju-secondary/70">-</span>
            )}
          </Row>
          {record.triggeredByRef && (
            <Row label="Trigger ref">
              <CopyableHash hex={record.triggeredByRef} label="trigger ref" />
            </Row>
          )}
          {record.actionSchemaVersion !== undefined && (
            <Row label="Action schema">
              <span>v{record.actionSchemaVersion}</span>
            </Row>
          )}
          {record.payloadCodec && (
            <Row label="Payload codec">
              <span className="font-mono">{record.payloadCodec}</span>
            </Row>
          )}
          <Row label="Purpose">
            <span className="font-mono">{record.purpose || '-'}</span>
          </Row>
          <Row label="Status">
            <span>{record.statusName || `code ${record.status}`}</span>
          </Row>
        </div>
      )}
    </section>
  );
}

// ===== Main =====

export function ResultViewerModal({ requestId, record, authorizer, onClose }: ResultViewerModalProps) {
  const { data, isLoading, error } = useAerResult(requestId, authorizer);
  const [copied, setCopied] = useState(false);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (data?.result && data?.resultHash) {
      verifyResultHash(data.result, data.resultHash).then(setHashValid);
    }
  }, [data?.result, data?.resultHash]);

  const handleCopy = () => {
    if (!data?.result) return;
    navigator.clipboard
      .writeText(data.result)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = data.result;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  };

  const handleDownload = () => {
    if (!data?.result) return;
    const blob = new Blob([data.result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nasun-ai-result-${requestId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errMsg = (error as Error | null)?.message;
  const isAccessDenied = errMsg === 'ACCESS_DENIED';
  // Lambda /result returns 404 in two distinct cases:
  // (a) cognition AER whose 7-day text TTL actually expired
  // (b) execution / settlement AER — no AI text body by design
  // Splitting these prevents the 2026-05-20 "trade just executed, why is
  // the result expired?" confusion.
  const isLambda404 = errMsg === 'EXPIRED';
  // Only Cognition (class=1) produces an AI text body. Execution (2),
  // Settlement (3), Observation (4), Coordination (5) all record only the
  // decision payload + outcome hash on chain. eventClass undefined is
  // treated as legacy cognition for backward compat.
  const isNonTextEvent =
    record.eventClass !== undefined && record.eventClass !== 1;
  const isExpiredCognition = isLambda404 && !isNonTextEvent;
  const isExecutionNoText = isLambda404 && isNonTextEvent;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-viewer-title"
        tabIndex={-1}
        className="bg-uju-bg border border-uju-border/60 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-uju-border/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h2 id="result-viewer-title" className="text-base font-semibold text-white">
                AI Execution Report
              </h2>
              <p className="text-sm text-uju-secondary/70">
                Tamper-evident audit trail · #{requestId}
              </p>
            </div>
            <a
              href={`${NETWORK_CONFIG.explorerUrl}/object/${record.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-md border border-uju-border/60 text-uju-secondary hover:text-white hover:border-pado-2/50 transition-colors"
              title="View AER object on Nasun Explorer"
            >
              Explorer
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-uju-card/60 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-uju-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <HeroSection record={record} />
          <TrustSection record={record} hashValid={hashValid} />
          <AISection record={record} />
          <CostSection record={record} />
          <LineageSection record={record} />

          {/* Result body / status */}
          {isLoading && (
            <div className="rounded-xl border border-uju-border/60 bg-uju-card/30 p-6 text-center text-sm text-uju-secondary">
              Loading result text...
            </div>
          )}
          {isExpiredCognition && (
            <div className="rounded-xl border border-uju-border/60 bg-uju-card/30 p-6 text-center space-y-1">
              <p className="text-sm text-uju-secondary">Result text expired</p>
              <p className="text-sm text-uju-secondary/70 max-w-sm mx-auto">
                AI text bodies are kept for 7 days. Every hash, decision, and outcome shown above
                stays on-chain forever.
              </p>
            </div>
          )}
          {isExecutionNoText && (
            <div className="rounded-xl border border-uju-border/60 bg-uju-card/30 p-6 text-center space-y-1">
              <p className="text-sm text-uju-secondary">On-chain only by design</p>
              <p className="text-sm text-uju-secondary/70 max-w-md mx-auto">
                Execution and settlement events record the decision payload and outcome hash on
                the network itself. The full audit trail is in the sections above; there is no
                separate AI text body for this entry.
              </p>
            </div>
          )}
          {isAccessDenied && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center space-y-1">
              <p className="text-sm text-red-400">Access denied</p>
              <p className="text-sm text-uju-secondary/70 max-w-sm mx-auto">
                Only the wallet that created this request can view the AI text body. The
                on-chain audit trail above is public.
              </p>
            </div>
          )}
          {error && !isExpiredCognition && !isExecutionNoText && !isAccessDenied && (
            <div className="rounded-xl border border-uju-border/60 bg-uju-card/30 p-6 text-center space-y-1">
              <p className="text-sm text-uju-secondary">Result text temporarily unavailable</p>
              <p className="text-sm text-uju-secondary/70">
                The on-chain record above remains verifiable. Please try again later.
              </p>
            </div>
          )}
          {data?.result && (
            <SectionCard
              title="AI text body"
              hint={
                hashValid === true
                  ? 'Hash matches on-chain record'
                  : hashValid === false
                  ? 'WARNING: hash mismatch'
                  : 'Verifying hash...'
              }
            >
              <pre className="whitespace-pre-wrap break-words text-sm text-white/90 leading-relaxed font-sans">
                {data.result}
              </pre>
            </SectionCard>
          )}

          <RawAuditSection record={record} />
        </div>

        {/* Footer */}
        {data?.result && (
          <div className="flex items-center justify-between p-4 border-t border-uju-border/60 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-card/60 transition-colors"
              >
                {copied ? 'Copied' : 'Copy text'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-card/60 transition-colors"
              >
                Download .md
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-card/60 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
