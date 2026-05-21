import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLpPositions } from '../../../lib/api/queries';
import type { LpPosition, LpPositions } from '../../../lib/api/types';
import { useSignAndExecute } from '../../../hooks/useSignAndExecute';
import { useToast } from '../../../store/useToastStore';
import { fmtUsdc } from '../../dashboard/format';
import { getExplorerObjectUrl } from '../../../lib/explorer';
import { buildRequestWithdraw, buildRedeemLiquidity } from '../transactions';
import { RequestWithdrawModal } from './RequestWithdrawModal';
import { Stat } from '../../../pages/LiquidityPoolPage';

/** Match the on-chain WITHDRAW_COOLDOWN_MS constant in bankroll_pool.move. */
const WITHDRAW_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * PnL = estimated_value - deposit_amount (signed NUSDC raw).
 * Shows '—' when the deposit row hasn't been indexed yet so we don't lie
 * with a 100% loss when really we just don't know yet.
 */
function PnlStat({ depositRaw, estimatedRaw }: { depositRaw: string | null; estimatedRaw: string }) {
  if (depositRaw === null) {
    return <Stat label="PnL" value="—" subnote="awaiting indexer match" />;
  }
  let pnlSigned: bigint;
  let depositBn: bigint;
  let estBn: bigint;
  try {
    depositBn = BigInt(depositRaw);
    estBn = BigInt(estimatedRaw);
    pnlSigned = estBn - depositBn;
  } catch {
    return <Stat label="PnL" value="—" />;
  }
  const isNegative = pnlSigned < 0n;
  const absRaw = isNegative ? -pnlSigned : pnlSigned;
  // PnL % with 2 decimal places. depositBn > 0 enforced by MIN_LP_DEPOSIT (10 NUSDC).
  const pctBps = depositBn > 0n ? Number((pnlSigned * 10_000n) / depositBn) : 0;
  const pctStr = (pctBps / 100).toFixed(2);
  const sign = isNegative ? '−' : '+';
  return (
    <Stat
      label="PnL"
      value={`${sign}${fmtUsdc(absRaw.toString())} NUSDC`}
      valueClass={isNegative ? 'text-rose-300' : 'text-emerald-300'}
      subnote={`${sign}${pctStr}% vs deposit`}
    />
  );
}

export function MyPositionsSection() {
  const { walletAddress, isWalletConnected } = useSignAndExecute();
  const { data, isLoading } = useLpPositions(walletAddress);

  if (!isWalletConnected) return null;

  return (
    <section className="panel p-5">
      <h2 className="font-display text-xl text-gold mb-3">My Positions</h2>

      {isLoading && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 bg-ink-800 rounded" />
          ))}
        </div>
      )}

      {!isLoading && data && data.positions.length === 0 && (
        <p className="text-sm text-neutral-200">
          No LP positions yet. Deposit NUSDC above to receive an LPToken.
        </p>
      )}

      {data && data.positions.length > 0 && (
        <ul className="space-y-3">
          {data.positions.map((p) => (
            <PositionCard key={p.lp_token_id} position={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PositionCard({ position: p }: { position: LpPosition }) {
  const { signAndExecute } = useSignAndExecute();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  // Drive a 1Hz countdown locally so the timer ticks without re-fetching.
  // Server-side claimable_at is the source of truth; we just visualize it.
  const claimableAtMs = p.claimable_at_ms ? Number(p.claimable_at_ms) : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (claimableAtMs === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [claimableAtMs]);

  const remainingMs = claimableAtMs !== null ? Math.max(0, claimableAtMs - now) : 0;
  const cooldownElapsed = claimableAtMs !== null && remainingMs === 0;

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Optimistic cache patch: update the row in every cached LP positions query
  // so the My Positions card flips to "Cooldown" immediately on success.
  // Backend re-fetch follows via invalidateQueries — when the fullnode catches
  // up, the cache is overwritten with chain truth.
  const applyOptimisticWithdrawRequested = () => {
    const nowMs = Date.now();
    queryClient.setQueriesData<LpPositions>(
      { queryKey: ['gostop', 'lp', 'positions'] },
      (old) => old && {
        ...old,
        positions: old.positions.map((pos) =>
          pos.lp_token_id === p.lp_token_id
            ? {
                ...pos,
                withdraw_requested_at_ms: String(nowMs),
                claimable_at_ms: String(nowMs + WITHDRAW_COOLDOWN_MS),
              }
            : pos,
        ),
      },
    );
  };

  const applyOptimisticRedeemed = () => {
    queryClient.setQueriesData<LpPositions>(
      { queryKey: ['gostop', 'lp', 'positions'] },
      (old) => old && {
        ...old,
        positions: old.positions.filter((pos) => pos.lp_token_id !== p.lp_token_id),
      },
    );
  };

  const callRequestWithdraw = async () => {
    setBusy(true);
    try {
      let attempt = 0;
      while (true) {
        try {
          await signAndExecute(buildRequestWithdraw(p.lp_token_id));
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt >= 1 || !/LockConflict|ObjectVersionMismatch|ObjectNotFound/.test(msg)) throw err;
          await new Promise((r) => setTimeout(r, 1500));
          attempt++;
        }
      }
      applyOptimisticWithdrawRequested();
      showToast('Cooldown started. Redeem available in 24h.', 'success');
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp', 'pool-state'] });
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp', 'apy'] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['gostop', 'lp', 'positions'] });
      }, 8000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Request withdraw failed: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const callRedeem = async () => {
    setBusy(true);
    try {
      let attempt = 0;
      while (true) {
        try {
          await signAndExecute(buildRedeemLiquidity(p.lp_token_id));
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt >= 1 || !/LockConflict|ObjectVersionMismatch|ObjectNotFound/.test(msg)) throw err;
          await new Promise((r) => setTimeout(r, 1500));
          attempt++;
        }
      }
      applyOptimisticRedeemed();
      showToast('Redeem complete. NUSDC sent to your wallet.', 'success');
      // Refresh pool-wide stats immediately; positions list is delayed because
      // the backend indexer needs a few seconds to pick up the LPToken burn
      // event. An immediate refetch would return the still-owned position
      // and overwrite the optimistic removal, forcing the user to reload.
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp', 'pool-state'] });
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp', 'apy'] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['gostop', 'lp', 'positions'] });
      }, 8000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Redeem failed: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // State machine: not_requested → requested (cooldown) → claimable → redeem.
  const stage: 'idle' | 'cooling' | 'claimable' =
    claimableAtMs === null ? 'idle' : cooldownElapsed ? 'claimable' : 'cooling';

  const claimableDate = claimableAtMs !== null
    ? new Date(claimableAtMs).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <li className="rounded-lg border border-gold-subtle bg-ink-900/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-mono text-neutral-100 break-all">
            {p.lp_token_id.slice(0, 14)}…{p.lp_token_id.slice(-6)}
          </span>
          <a
            href={getExplorerObjectUrl(p.lp_token_id)}
            target="_blank"
            rel="noopener noreferrer"
            title="View LPToken on Nasun Explorer"
            aria-label="View LPToken on Nasun Explorer"
            className="inline-flex items-center text-neutral-300 hover:text-gold-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="M14 3h7v7" />
              <path d="M10 14L21 3" />
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
            </svg>
          </a>
        </div>
        <div className="text-sm text-neutral-300">
          Soulbound · not transferable
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <Stat label="Shares" value={p.shares} />
        <Stat
          label="Deposited"
          value={p.deposit_amount_nusdc !== null ? `${fmtUsdc(p.deposit_amount_nusdc)} NUSDC` : '—'}
          subnote={p.deposit_amount_nusdc === null ? 'awaiting indexer match' : undefined}
        />
        <Stat
          label="Est. value"
          value={`${fmtUsdc(p.estimated_value_nusdc)} NUSDC`}
        />
        <PnlStat
          depositRaw={p.deposit_amount_nusdc}
          estimatedRaw={p.estimated_value_nusdc}
        />
        <Stat
          label="Stage"
          value={stage === 'idle' ? 'Idle' : stage === 'cooling' ? 'Cooldown' : 'Ready to redeem'}
          valueClass={
            stage === 'claimable' ? 'text-emerald-300' :
            stage === 'cooling' ? 'text-amber-200' :
            'text-neutral-100'
          }
        />
      </div>

      {stage === 'cooling' && claimableDate && (
        <div className="rounded-md border border-amber-400/20 bg-amber-500/5 px-3 py-2">
          <span className="block text-xs uppercase tracking-widest text-amber-200">Cooldown</span>
          <span className="block font-mono text-lg text-amber-100">{fmtRemaining(remainingMs)}</span>
          <span className="block text-xs text-neutral-300 mt-0.5">
            Withdraw available from {claimableDate} onward (no deadline).
          </span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {stage === 'idle' && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-ink-700 hover:bg-ink-600 text-neutral-100 text-sm border border-gold-subtle disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Request withdraw
          </button>
        )}
        {stage === 'cooling' && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            title="Calling again restarts the 24h cooldown timer."
            className="px-3 py-2 rounded-md bg-ink-800 hover:bg-ink-700 text-neutral-300 text-sm border border-gold-subtle disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Restart cooldown
          </button>
        )}
        {stage === 'claimable' && (
          <button
            onClick={callRedeem}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-gold-400/90 hover:bg-gold-400 text-ink-950 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Submitting…' : 'Redeem NUSDC'}
          </button>
        )}
      </div>
      <RequestWithdrawModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={callRequestWithdraw}
        position={p}
        restart={stage === 'cooling'}
        submitting={busy}
      />
    </li>
  );
}
