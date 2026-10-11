/**
 * Structured proposal card rendered inside the assistant turn when the wake
 * outcome includes a `proposal` artifact (`@nasun/baram-sdk` Proposal).
 *
 * Why a dedicated card vs. plain markdown: the proposal has a hard expiry, a
 * decision to make, and a small fixed schema. Rendering it as markdown would
 * lose the live countdown and leave nothing to act on.
 *
 * The card used to offer only "Open in Telegram", and that link could never
 * work: the bot's /start reads its payload as a session sid, so
 * `proposal_<id>` fell through to bindTelegramUser and came back as "link
 * already used". Confirm and Cancel now answer in place, through
 * POST /api/nasun-ai/chat/proposal/{confirm,cancel}.
 */

import { useEffect, useState } from 'react';
import type { Message, WakeProposal } from '../../types/chat';

interface ProposalCardProps {
  proposal: WakeProposal;
  /** Absent is treated as 'pending'. */
  status?: Message['proposalStatus'];
  /** Omitted in read-only contexts (history replay), which hides the buttons. */
  onConfirm?: () => void;
  onCancel?: () => void;
}

function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return 'expired';
  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatSize(quoteRaw: string, symbol: string): string {
  // size_quote_raw is the quote-token amount in smallest units (string). We
  // don't have on-card access to per-token decimals, so show the raw string
  // verbatim with a unit suffix.
  return `${quoteRaw} ${symbol}`;
}

function settledLabel(status: Message['proposalStatus']): string | null {
  switch (status) {
    case 'confirmed':
      return 'Confirmed. Submitting to the chain.';
    case 'cancelled':
      return 'Cancelled. Your agent is free to trade again.';
    case 'resolved':
      return 'Already answered.';
    default:
      return null;
  }
}

export function ProposalCard({ proposal, status, onConfirm, onCancel }: ProposalCardProps) {
  const expiresAtMs = new Date(proposal.expires_at).getTime();
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const msLeft = expiresAtMs - now;
  const expired = msLeft <= 0;
  const submitting = status === 'submitting';
  const settled = settledLabel(status);
  // While an answer is in flight, keep showing the buttons (disabled) even if
  // the countdown lapses: the confirm may already have been accepted, and
  // swapping in "expired before it was answered" would state the opposite.
  // The countdown is only a client-side hint anyway; the server re-checks
  // expiry on every answer, so a stale clock cannot buy a trade.
  const actionable = (!expired || submitting) && !settled && !!onConfirm && !!onCancel;
  const sideClass =
    proposal.side === 'BUY'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30'
      : 'text-rose-300 bg-rose-500/10 border-rose-400/30';

  return (
    <div className="mt-3 rounded-lg border border-uju-border/60 bg-uju-card/60 p-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded border ${sideClass}`}
        >
          {proposal.side}
        </span>
        <span className="text-white font-medium">{proposal.symbol}</span>
        <span className="text-uju-secondary/80">
          size {formatSize(proposal.size_quote_raw, proposal.symbol)}
        </span>
        <span
          className={`ml-auto text-xs ${
            expired ? 'text-uju-secondary/50' : 'text-uju-secondary'
          }`}
          title={`Expires at ${proposal.expires_at}`}
        >
          {expired ? 'Expired' : formatCountdown(msLeft)}
        </span>
      </div>
      {proposal.summary && (
        <p className="mt-2 text-uju-secondary leading-relaxed">{proposal.summary}</p>
      )}
      {actionable && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold bg-pado-2 text-uju-bg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm border border-uju-border/60 text-uju-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      )}
      {settled && <p className="mt-3 text-sm text-uju-secondary">{settled}</p>}
      {expired && !settled && !submitting && (
        <p className="mt-3 text-sm text-uju-secondary/70">
          This proposal expired before it was answered. Ask again for a fresh one.
        </p>
      )}
    </div>
  );
}
