import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useRound } from '../../../lib/api/queries';
import type { RecentRound, RoundDetail } from '../../../lib/api/types';
import { normalizeSessionHex } from '../../replay/sessionId';
import {
  fmtAbsoluteTime,
  fmtUsdc,
  gameLabel,
  multiplierBpsToX,
  shortWallet,
} from '../format';
import ShareIntentButtons from '../../share/ShareIntentButtons';
import {
  buildShareMessage,
  buildShareUrlForGame,
  canShareRound,
} from '../../share/shareUrl';
import { useGostopAuth } from '../../../hooks/useGostopAuth';
import { getExplorerTxUrl } from '../../../lib/explorer';

interface RoundDetailModalProps {
  round: RecentRound | null;
  onClose: () => void;
}

export function RoundDetailModal({ round, onClose }: RoundDetailModalProps) {
  useEffect(() => {
    if (!round) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [round, onClose]);

  const game = round?.key as RoundDetail['game'] | undefined;
  const sessionId = round?.session_id_hex;
  const { data, isLoading, isError, error } = useRound(game, sessionId);
  const { walletAddress } = useGostopAuth();
  // Share buttons render for won rounds owned by the viewing user. Anonymous
  // rounds short-circuit to false because the masked player string never
  // matches a wallet. Caller (RecentRoundsTable) only opens this modal for
  // the user's own history, but we still gate defensively (review C1).
  const canShare = data ? canShareRound(data.round, walletAddress) : false;

  if (!round) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-gold">{gameLabel(round.key)} Round</h2>
            <p className="font-mono text-sm text-neutral-300 mt-1 break-all">
              session {sessionId}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-neutral-300 hover:text-neutral-100">
            ✕
          </button>
        </div>

        {isLoading && <p className="text-sm text-neutral-200">Loading round…</p>}
        {isError && (
          <p className="text-sm text-rose-300">
            Failed to load round: {error.message}
          </p>
        )}

        {data && <RoundBody data={data} />}

        {data && canShare && (
          <ShareSection
            shareUrl={buildShareUrlForGame(data.game, data.session_id)}
            message={buildShareMessage(data.round, data.game)}
            txDigest={data.round.tx_digest}
          />
        )}

        {data && (
          <ModalFooter
            txDigest={data.round.tx_digest}
            replaySessionIdHex={
              data.extras.kind === 'lottery' ? data.session_id : null
            }
            // View on Explorer is rendered inline next to the share buttons
            // when the share section is visible, so hide the footer duplicate
            // to keep a single canonical placement.
            hideExplorerLink={canShare}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function ModalFooter({
  txDigest,
  replaySessionIdHex,
  hideExplorerLink,
}: {
  txDigest: string;
  replaySessionIdHex: string | null;
  hideExplorerLink?: boolean;
}) {
  // Backend echoes the canonical (lowercase, no-0x) session_id from the URL
  // it received, but normalize defensively so a future format tweak does not
  // produce a broken link silently.
  const normalizedReplay = replaySessionIdHex
    ? normalizeSessionHex(replaySessionIdHex)
    : null;
  if (!normalizedReplay && hideExplorerLink) {
    // Nothing left to render — collapse the footer entirely so we don't
    // emit an empty bordered div.
    return null;
  }
  return (
    <div className="pt-3 border-t border-gold-subtle flex flex-wrap justify-end items-center gap-4">
      {normalizedReplay && (
        <Link
          to={`/replay/lottery/${normalizedReplay}`}
          className="inline-flex items-center gap-1 text-sm text-gold-200 hover:text-gold-100"
        >
          View full replay
          <span aria-hidden>→</span>
        </Link>
      )}
      {!hideExplorerLink && <ViewOnExplorerLink txDigest={txDigest} />}
    </div>
  );
}

function ViewOnExplorerLink({ txDigest }: { txDigest: string }) {
  return (
    <a
      href={getExplorerTxUrl(txDigest)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View transaction on Nasun Explorer"
      className="inline-flex items-center gap-1.5 text-sm text-gold-200 hover:text-gold-100"
    >
      View on Explorer
      <ExternalLinkIcon />
    </a>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ShareSection({
  shareUrl,
  message,
  txDigest,
}: {
  shareUrl: string;
  message: string;
  txDigest: string;
}) {
  return (
    <div className="pt-3 border-t border-gold-subtle space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-neutral-300">
        Share this win
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ShareIntentButtons shareUrl={shareUrl} message={message} hideCopy />
        <ViewOnExplorerLink txDigest={txDigest} />
      </div>
    </div>
  );
}

function RoundBody({ data }: { data: RoundDetail }) {
  const r = data.round;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <Field label="Player" value={r.anonymous ? `~${r.player.slice(0, 10)}` : shortWallet(r.player)} mono />
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
        <Field label="Seq" value={String(r.event_seq)} mono />
      </div>

      {data.extras.kind === 'lottery' && <LotteryExtras extras={data.extras} />}
      {data.extras.kind === 'crash' && <CrashExtras extras={data.extras} />}
      {data.extras.kind === 'generic' && (
        <p className="text-sm text-neutral-300 italic">
          No per-game replay data for {gameLabel(data.game)}. The chain transaction
          is the canonical record.
        </p>
      )}
    </div>
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

function LotteryExtras({
  extras,
}: {
  extras: Extract<RoundDetail['extras'], { kind: 'lottery' }>;
}) {
  const { ticket, round } = extras;
  if (!ticket && !round) {
    return <p className="text-sm text-neutral-300">No lottery data found.</p>;
  }
  return (
    <div className="space-y-3 pt-3 border-t border-gold-subtle">
      {ticket && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">Your Ticket</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {ticket.numbers.map((n) => {
              const matched = round?.drawn_numbers.includes(n);
              return (
                <span
                  key={n}
                  className={`w-9 h-9 inline-flex items-center justify-center rounded-full font-mono text-sm ${
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
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Field label="Round" value={`#${ticket.round_number}`} mono />
            <Field label="Status" value={ticket.status} />
            <Field
              label="Match"
              value={ticket.match_count !== null ? `${ticket.match_count}/5` : '—'}
            />
            <Field label="Tier" value={ticket.tier !== null ? `T${ticket.tier}` : '—'} />
            <Field label="Expected" value={`${fmtUsdc(ticket.expected_payout)} NUSDC`} mono />
            <Field label="Claimed" value={`${fmtUsdc(ticket.claimed_payout)} NUSDC`} mono />
          </div>
        </div>
      )}
      {round && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">Drawn Numbers</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {round.drawn_numbers.length === 0 ? (
              <span className="text-sm text-neutral-300">Not drawn yet.</span>
            ) : (
              round.drawn_numbers.map((n) => (
                <span
                  key={n}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-gold-400/20 text-gold-100 border border-gold-300/50 font-mono text-sm"
                >
                  {n}
                </span>
              ))
            )}
          </div>
          <div className="text-sm text-neutral-300">
            Drawn at: {fmtAbsoluteTime(round.drawn_at_ms)} · Claim by:{' '}
            {fmtAbsoluteTime(round.claim_deadline_ms)}
          </div>
        </div>
      )}
    </div>
  );
}

function CrashExtras({
  extras,
}: {
  extras: Extract<RoundDetail['extras'], { kind: 'crash' }>;
}) {
  const { round, cashouts } = extras;
  if (!round) return <p className="text-sm text-neutral-300">No crash data found.</p>;
  const crashAtX = (Number(round.crash_point_bps) / 10000).toFixed(2);
  return (
    <div className="space-y-3 pt-3 border-t border-gold-subtle">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Field label="Crash At" value={`${crashAtX}x`} mono />
        <Field label="Crash Time" value={fmtAbsoluteTime(round.crash_time_ms)} />
        <Field label="Total Bet" value={`${fmtUsdc(round.total_bet)} NUSDC`} mono />
        <Field label="Total Payout" value={`${fmtUsdc(round.total_payout)} NUSDC`} mono />
        <Field label="Cashouts" value={String(round.cashout_count)} />
        <Field
          label="Commit"
          value={round.commit_hash ? `${round.commit_hash.slice(0, 10)}…` : '—'}
          mono
        />
        <Field
          label="Salt"
          value={round.salt ? `${round.salt.slice(0, 10)}…` : '—'}
          mono
        />
        <Field
          label="Verified"
          value={round.commit_verified === true ? '✓' : round.commit_verified === false ? '✗' : '—'}
        />
      </div>

      {cashouts.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">
            Cashout Order ({cashouts.length})
          </h3>
          <ul className="space-y-1 text-sm font-mono">
            {cashouts.map((c, i) => (
              <li
                key={`${c.player}-${c.cashout_ts_ms}-${i}`}
                className="flex items-center justify-between gap-3 py-1 px-2 rounded hover:bg-gold-400/5"
              >
                <span className="text-neutral-200">{shortWallet(c.player)}</span>
                <span className="text-gold-200">
                  {(Number(c.cashout_mul_bps) / 10000).toFixed(2)}x
                </span>
                <span className="text-xs text-neutral-300">
                  {fmtAbsoluteTime(c.cashout_ts_ms)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
