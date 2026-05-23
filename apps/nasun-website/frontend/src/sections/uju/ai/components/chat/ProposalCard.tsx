/**
 * Structured proposal card rendered inside the assistant turn when the wake
 * outcome includes a `proposal` artifact (`@nasun/baram-sdk` Proposal).
 *
 * Why a dedicated card vs. plain markdown: the proposal has a hard expiry,
 * a click-through CTA, and a small fixed schema. Rendering it as markdown
 * would lose the live countdown and make the CTA brittle. The card here
 * derives its TG deep link from `proposal.tgDeepLink ?? fallback`, so a
 * future chat-server upgrade that supplies the field activates without a
 * frontend redeploy.
 */

import { useEffect, useState } from 'react';
import type { WakeProposal } from '../../types/chat';

interface ProposalCardProps {
  proposal: WakeProposal;
}

const FALLBACK_BOT = 'https://t.me/nasun_ai_bot';

function buildDeepLink(p: WakeProposal): string {
  if (p.tgDeepLink && /^https:\/\/t\.me\//.test(p.tgDeepLink)) return p.tgDeepLink;
  // Server may add tgDeepLink later. Fallback uses the proposal_id as a start
  // parameter so the bot can deep-link the user to the right confirm prompt
  // when the server-side wiring lands. Until then the bot just opens to its
  // default greeting and the user finishes from there.
  return `${FALLBACK_BOT}?start=proposal_${encodeURIComponent(p.proposal_id)}`;
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
  // verbatim with a unit suffix. The Telegram deep-link surface is where the
  // user does the actual numeric review; this card is a glance affordance.
  return `${quoteRaw} ${symbol}`;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const expiresAtMs = new Date(proposal.expires_at).getTime();
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const msLeft = expiresAtMs - now;
  const expired = msLeft <= 0;
  const deepLink = buildDeepLink(proposal);
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
      <a
        href={expired ? undefined : deepLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (expired) e.preventDefault();
        }}
        className={`mt-3 inline-flex items-center gap-1 text-sm rounded-md px-2 py-1 transition-colors ${
          expired
            ? 'border border-uju-border/40 text-uju-secondary/50 cursor-not-allowed'
            : 'border border-pado-2/40 text-pado-2 hover:bg-pado-2/10'
        }`}
        aria-disabled={expired}
      >
        Open in Telegram
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    </div>
  );
}
