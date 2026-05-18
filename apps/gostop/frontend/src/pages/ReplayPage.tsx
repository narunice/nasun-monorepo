/**
 * ReplayPage — Tier 0 PR-5 (lottery only).
 *
 * Public route: `/replay/lottery/:sessionId` (hex). 1:1 with backend
 * `GET /api/gostop/round/lottery/:session_id`. Backend masks anonymous and
 * 404s opt-out / delayed-within-24h rounds; this page mirrors those states.
 *
 * Tier 0.5 (Share Button, 2026-05-18): won rounds owned by the viewing user
 * surface X/Telegram/Copy share affordances. shareUrl is built from the
 * server-validated session_id (not window.location.href) so non-owner viewers
 * cannot claim referral credit on someone else's round. Anonymous rounds are
 * never marked as own (the masked player string never matches a wallet).
 *
 * scratch/numbermatch/mines/wheel replay is Tier 1 backlog (RoundDetailModal
 * stays the only surface for non-lottery games until then). crash is
 * indefinitely shut down.
 */

import { Link, useParams } from 'react-router-dom';
import { useRound } from '../lib/api/queries';
import { ApiError } from '../lib/api/client';
import type { RoundDetail } from '../lib/api/types';
import {
  decodeLotterySessionId,
  normalizeSessionHex,
} from '../features/replay/sessionId';
import { getExplorerTxUrl } from '../lib/explorer';
import {
  fmtAbsoluteTime,
  fmtUsdc,
  multiplierBpsToX,
  shortWallet,
} from '../features/dashboard/format';
import ShareIntentButtons from '../features/share/ShareIntentButtons';
import {
  buildShareMessage,
  buildShareUrlForGame,
  canShareRound,
} from '../features/share/shareUrl';
import { useGostopAuth } from '../hooks/useGostopAuth';

export default function ReplayPage() {
  const { sessionId: rawSessionId } = useParams<{ sessionId: string }>();
  const normalized = normalizeSessionHex(rawSessionId);
  const decoded = decodeLotterySessionId(rawSessionId);

  // Pass the normalized form to the API to avoid 0x-vs-no-0x cache splits.
  // `useRound` itself re-validates and lowercases.
  const { data, isLoading, isError, error } = useRound(
    normalized ? 'lottery' : undefined,
    normalized ?? undefined,
  );

  if (!normalized || !decoded) {
    return (
      <ReplayShell>
        <PlaceholderPanel
          title="Invalid round link"
          body="This URL does not encode a valid lottery session id. Check the link or browse Recent Rounds in your Suite."
        />
      </ReplayShell>
    );
  }

  if (isLoading) {
    return (
      <ReplayShell>
        <section className="panel p-6 animate-pulse space-y-3">
          <div className="h-7 bg-ink-800 rounded w-1/3" />
          <div className="h-5 bg-ink-800 rounded w-1/2" />
          <div className="h-32 bg-ink-800 rounded" />
        </section>
      </ReplayShell>
    );
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    if (notFound) {
      return (
        <ReplayShell>
          <PlaceholderPanel
            title="This round is not publicly viewable"
            body="The player who placed this ticket has chosen to keep recent rounds private, or the round predates the 24h delay window. The chain transaction is still on Nasun explorer."
          />
        </ReplayShell>
      );
    }
    return (
      <ReplayShell>
        <PlaceholderPanel
          title="Failed to load round"
          body={error.message}
        />
      </ReplayShell>
    );
  }

  if (!data || data.extras.kind !== 'lottery') {
    return (
      <ReplayShell>
        <PlaceholderPanel
          title="Unexpected round shape"
          body="The server returned a non-lottery payload for this URL. Try opening the round from your Suite."
        />
      </ReplayShell>
    );
  }

  return (
    <ReplayShell>
      <LotteryReplay data={data} />
    </ReplayShell>
  );
}

function ReplayShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-neutral-300">
          <Link to="/suite" className="hover:text-gold-200">Suite</Link>
          <span className="mx-2 text-neutral-400">/</span>
          <span className="text-gold-300">Lottery Replay</span>
        </p>
        <h1 className="font-display text-3xl text-gold">Round Replay</h1>
      </header>
      {children}
    </div>
  );
}

function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel p-6 space-y-2">
      <h2 className="font-display text-xl text-gold">{title}</h2>
      <p className="text-sm text-neutral-200">{body}</p>
    </section>
  );
}

function LotteryReplay({ data }: { data: RoundDetail }) {
  if (data.extras.kind !== 'lottery') return null;
  const { ticket, round } = data.extras;
  const r = data.round;
  const { walletAddress } = useGostopAuth();
  // Share buttons only render for the round owner on a won round.
  // - Server already 404s opt-out + delayed-within-24h, so we never reach
  //   here for those; isOwn gating keeps anonymous & non-owner viewers from
  //   spoofing referral credit on someone else's link (review C1).
  const isOwnWin = canShareRound(r, walletAddress);
  const shareUrl = buildShareUrlForGame(data.game, data.session_id);
  const shareMessage = buildShareMessage(r, data.game);

  return (
    <div className="space-y-5">
      <CommonHeader data={data} />

      <section className="panel p-5 space-y-4">
        <h2 className="font-display text-xl text-gold">
          {ticket ? `Ticket — Round #${ticket.round_number}` : 'Lottery Round'}
        </h2>

        {ticket && round ? (
          <NumbersGrid drawn={round.drawn_numbers} chosen={ticket.numbers} />
        ) : ticket ? (
          <NumbersGrid drawn={[]} chosen={ticket.numbers} pendingDraw />
        ) : round ? (
          <NumbersGrid drawn={round.drawn_numbers} chosen={[]} />
        ) : (
          <p className="text-sm text-neutral-300">No lottery data found for this round.</p>
        )}

        {ticket && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-3 border-t border-gold-subtle">
            <Field label="Status" value={ticket.status} />
            <Field
              label="Match"
              value={ticket.match_count !== null ? `${ticket.match_count}/5` : '—'}
            />
            <Field label="Tier" value={ticket.tier !== null ? `T${ticket.tier}` : '—'} />
            <Field
              label="Expected"
              value={`${fmtUsdc(ticket.expected_payout)} NUSDC`}
              mono
            />
            <Field
              label="Claimed"
              value={`${fmtUsdc(ticket.claimed_payout)} NUSDC`}
              mono
            />
            {ticket.claim_ts_ms !== null && (
              <Field label="Claimed at" value={fmtAbsoluteTime(ticket.claim_ts_ms)} />
            )}
          </div>
        )}

        {round && (
          <div className="text-sm text-neutral-300 pt-3 border-t border-gold-subtle">
            Drawn at {fmtAbsoluteTime(round.drawn_at_ms)} · Claim by{' '}
            {fmtAbsoluteTime(round.claim_deadline_ms)}
          </div>
        )}
      </section>

      {isOwnWin && (
        <section
          className="panel p-5 space-y-3"
          aria-label="Share this win"
        >
          <h2 className="font-display text-xl text-gold">Share this win</h2>
          <p className="text-sm text-neutral-300">
            Post your verified round to X or Telegram — anyone can replay it on chain.
          </p>
          <ShareIntentButtons shareUrl={shareUrl} message={shareMessage} />
        </section>
      )}

      <VerificationPanel txDigest={r.tx_digest} />
    </div>
  );
}

function CommonHeader({ data }: { data: RoundDetail }) {
  const r = data.round;
  const player = r.anonymous ? r.player : shortWallet(r.player);
  return (
    <section className="panel p-5 space-y-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-neutral-300">Player</p>
        <p className="font-mono text-base text-neutral-100">{player}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-gold-subtle">
        <Field label="Bet" value={`${fmtUsdc(r.bet_amount)} NUSDC`} mono />
        <Field label="Payout" value={`${fmtUsdc(r.payout)} NUSDC`} mono />
        <Field label="Mult" value={multiplierBpsToX(r.multiplier_bps)} mono />
        <Field label="Status" value={r.status} />
        <Field label="Time" value={fmtAbsoluteTime(r.timestamp_ms)} />
        <Field
          label="Tx"
          value={`${r.tx_digest.slice(0, 8)}…${r.tx_digest.slice(-4)}`}
          mono
        />
      </div>

      <div>
        <a
          href={getExplorerTxUrl(r.tx_digest)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-gold-200 hover:text-gold-100"
        >
          View transaction on Nasun explorer
          <ExternalIcon />
        </a>
      </div>
    </section>
  );
}

function NumbersGrid({
  drawn,
  chosen,
  pendingDraw,
}: {
  drawn: number[];
  chosen: number[];
  pendingDraw?: boolean;
}) {
  const drawnSet = new Set(drawn);
  return (
    <div className="space-y-4">
      {chosen.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">
            Ticket Numbers
          </h3>
          <div className="flex flex-wrap gap-2">
            {chosen.map((n) => {
              const matched = drawnSet.has(n);
              return (
                <span
                  key={`c-${n}`}
                  className={`w-10 h-10 inline-flex items-center justify-center rounded-full font-mono text-base ${
                    matched
                      ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/60'
                      : 'bg-ink-800 text-neutral-200 border border-gold-subtle'
                  }`}
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">
          Drawn Numbers
        </h3>
        {pendingDraw || drawn.length === 0 ? (
          <p className="text-sm text-neutral-300">
            Draw has not happened yet for this round.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {drawn.map((n) => (
              <span
                key={`d-${n}`}
                className="w-10 h-10 inline-flex items-center justify-center rounded-full bg-gold-400/20 text-gold-100 border border-gold-300/50 font-mono text-base"
              >
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VerificationPanel({ txDigest }: { txDigest: string }) {
  return (
    <section className="panel p-5 space-y-3">
      <h2 className="font-display text-xl text-gold">How this is verified</h2>
      <p className="text-sm text-neutral-200 leading-relaxed">
        Lottery draws are deterministic: the drawn numbers are derived on chain
        from the round number and the draw clock, so the same inputs always
        produce the same numbers. There is no off-chain randomness to trust.
        Anyone can re-derive the result from the transaction below and confirm
        it matches.
      </p>
      <a
        href={getExplorerTxUrl(txDigest)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-gold-200 hover:text-gold-100"
      >
        Open draw transaction on explorer
        <ExternalIcon />
      </a>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-neutral-300 block">{label}</span>
      <span className={`text-sm text-neutral-100 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
