/**
 * RequestWithdrawModal — pre-confirm dialog before request_withdraw.
 *
 * Spelling out the 2-step lifecycle and the redeem-time-price caveat before
 * we burn a tx fee was missing — the previous "Cooldown started" toast left
 * users confused about whether their NUSDC was already coming back. The
 * modal puts the LPToken state diagram front and center so the click is an
 * informed one.
 *
 * Same `restart` flag is reused when the user clicks "Restart cooldown" on a
 * position that is already cooling — the call resets withdraw_requested_at
 * to now, which is operationally identical to a fresh request and should be
 * confirmed with the same gravity (the previously-accrued countdown is lost).
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LpPosition } from '../../../lib/api/types';
import { fmtUsdc } from '../../dashboard/format';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  position: LpPosition;
  restart: boolean;
  submitting: boolean;
}

export function RequestWithdrawModal({ open, onClose, onConfirm, position, restart, submitting }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const title = restart ? 'Restart 24h cooldown?' : 'Start 24h cooldown?';
  const cta   = restart ? 'Restart cooldown' : 'Start cooldown';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="panel max-w-lg w-full p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-withdraw-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="request-withdraw-modal-title" className="font-display text-2xl text-gold">
            {title}
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="text-neutral-300 hover:text-neutral-100 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-neutral-200">
          Withdrawing liquidity is a <span className="text-gold-200">two-step process</span>. This
          confirmation only starts the cooldown — your NUSDC stays in the pool until you redeem
          after the 24-hour wait.
        </p>

        <ol className="space-y-2 text-sm text-neutral-200">
          <Step
            n={1}
            done
            label="Request"
            desc="On confirm, your LPToken records a withdraw_requested_at timestamp on chain and the 24h timer starts. No NUSDC moves yet."
          />
          <Step
            n={2}
            label="Wait 24h"
            desc="During this window the pool can absorb live betting PnL. The card shows a live countdown."
          />
          <Step
            n={3}
            label="Redeem"
            desc="After the cooldown, click 'Redeem NUSDC' on this same card. Your LPToken is burned and NUSDC lands in your wallet."
          />
        </ol>

        <div className="rounded-md border border-amber-400/30 bg-amber-500/5 px-3 py-3 space-y-1">
          <p className="text-sm font-medium text-amber-100">Redeem-time pricing</p>
          <p className="text-sm text-neutral-200">
            NUSDC received = your shares × <em>share price at redeem time</em>, not now. If the
            pool wins or loses during the cooldown, your payout moves with it. Partial withdraws
            are not supported — redeem returns the full LPToken value.
          </p>
        </div>

        {restart && (
          <div className="rounded-md border border-rose-400/30 bg-rose-500/5 px-3 py-3 space-y-1">
            <p className="text-sm font-medium text-rose-200">You are restarting an active cooldown</p>
            <p className="text-sm text-neutral-200">
              This position is already in cooldown. Confirming will reset the timer back to a full
              24 hours, and any time already accrued is lost.
            </p>
          </div>
        )}

        <div className="rounded-md border border-gold-subtle bg-ink-900/40 px-3 py-3 space-y-1">
          <p className="text-sm uppercase tracking-widest text-neutral-300">This position</p>
          <p className="text-sm font-mono text-neutral-100 break-all">
            {position.lp_token_id.slice(0, 16)}…{position.lp_token_id.slice(-8)}
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <p className="text-sm text-neutral-300">Shares</p>
              <p className="text-sm font-mono text-neutral-100">{position.shares}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-300">Est. value now</p>
              <p className="text-sm font-mono text-gold-200">
                {fmtUsdc(position.estimated_value_nusdc)} NUSDC
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-ink-700 hover:bg-ink-600 text-neutral-100 text-sm border border-gold-subtle disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-gold-400/90 hover:bg-gold-400 text-ink-950 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : cta}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step({ n, label, desc, done }: { n: number; label: string; desc: string; done?: boolean }) {
  return (
    <li className="flex gap-3">
      <span
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-mono ${
          done
            ? 'bg-gold-400/20 text-gold-100 border border-gold-300/40'
            : 'bg-ink-800 text-neutral-300 border border-gold-subtle'
        }`}
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{label}</p>
        <p className="text-sm text-neutral-300">{desc}</p>
      </div>
    </li>
  );
}
