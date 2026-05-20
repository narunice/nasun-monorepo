/**
 * ProvideLiquidityModal — pre-confirm dialog before provide_liquidity.
 *
 * LP capital is locked behind a 24h cooldown on the way out. Surfacing that
 * rule on the deposit form alone (a single line near the disclosure block)
 * was insufficient — users were learning about the cooldown only when they
 * tried to withdraw. This modal puts the lifecycle in front of the deposit
 * tx so the lock-in expectation is set before any NUSDC moves.
 *
 * The dialog also previews expected shares from the current share price so
 * the user can sanity-check the math against the disclosure copy.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fmtUsdc } from '../../dashboard/format';
import { previewSharesForDeposit } from '../share-math';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Deposit amount in NUSDC base units (6 decimals). */
  amountBaseUnits: bigint;
  /** Pool's current share_price_scaled (1e9 scale) — used to preview shares. */
  sharePriceScaled: string | undefined;
  submitting: boolean;
}

export function ProvideLiquidityModal({
  open,
  onClose,
  onConfirm,
  amountBaseUnits,
  sharePriceScaled,
  submitting,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  // Expected shares preview. Simplified vs Move compute_shares_to_mint
  // (no +1 virtual offset); the chain returns the authoritative count on
  // tx confirm. previewSharesForDeposit handles the pps<=0 case.
  let expectedShares: string | null = null;
  try {
    const pps = sharePriceScaled ? BigInt(sharePriceScaled) : 0n;
    if (pps > 0n) {
      expectedShares = previewSharesForDeposit(amountBaseUnits, pps).toString();
    }
  } catch {
    expectedShares = null;
  }

  const sharePriceDisplay = sharePriceScaled
    ? (Number(BigInt(sharePriceScaled)) / 1e9).toFixed(6)
    : '—';

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
        aria-labelledby="provide-liquidity-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="provide-liquidity-modal-title" className="font-display text-2xl text-gold">
            Confirm liquidity deposit
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

        <div className="rounded-md border border-gold-subtle bg-ink-900/40 px-3 py-3 space-y-2">
          <p className="text-sm uppercase tracking-widest text-neutral-300">You deposit</p>
          <p className="font-mono text-xl text-gold-200">
            {fmtUsdc(amountBaseUnits.toString())} NUSDC
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <p className="text-sm text-neutral-300">Share price now</p>
              <p className="text-sm font-mono text-neutral-100">{sharePriceDisplay}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-300">Expected shares</p>
              <p className="text-sm font-mono text-neutral-100">
                {expectedShares ?? '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-3 space-y-1">
          <p className="text-sm font-medium text-amber-100">
            Withdrawals require a 24-hour cooldown
          </p>
          <p className="text-sm text-neutral-200">
            Your NUSDC cannot be pulled out instantly. To exit you must call{' '}
            <span className="text-amber-100">request_withdraw</span> first, wait 24 hours, then
            redeem. There is no early-exit escape hatch.
          </p>
        </div>

        <div>
          <p className="text-sm text-neutral-300 uppercase tracking-widest mb-2">How withdrawals work later</p>
          <ol className="space-y-2 text-sm text-neutral-200">
            <Step n={1} label="Request withdraw" desc="Marks your LPToken and starts the 24h timer. No NUSDC moves yet." />
            <Step n={2} label="Wait 24h"          desc="The pool keeps absorbing live betting PnL during the wait — your future payout can move up or down with it." />
            <Step n={3} label="Redeem NUSDC"      desc="After the timer, redeem burns the LPToken and pays out: shares × share_price at that moment, in full (partial redeem is not supported)." />
          </ol>
        </div>

        <div className="rounded-md border border-gold-subtle bg-ink-900/40 px-3 py-3 space-y-1">
          <p className="text-sm text-neutral-200">
            <span className="text-gold-200">Soulbound LPToken:</span> the token can't be transferred
            to another wallet. Only the wallet that deposited can redeem.
          </p>
          <p className="text-sm text-neutral-200">
            <span className="text-gold-200">No deadline:</span> the LPToken stays redeemable
            indefinitely after the cooldown — you do not have to act within a window.
          </p>
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
            {submitting ? 'Submitting…' : 'Confirm deposit'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step({ n, label, desc }: { n: number; label: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-mono bg-ink-800 text-neutral-200 border border-gold-subtle">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{label}</p>
        <p className="text-sm text-neutral-300">{desc}</p>
      </div>
    </li>
  );
}
