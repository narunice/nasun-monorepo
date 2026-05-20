import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useLpPoolState,
  useLpApy,
  useLpPositions,
} from '../lib/api/queries';
import type { DataQuality, LpPosition } from '../lib/api/types';
import { useSignAndExecute } from '../hooks/useSignAndExecute';
import { useToast } from '../store/useToastStore';
import { useBalanceStore } from '../store/useBalanceStore';
import { getSuiClient } from '../lib/sui-client';
import { findNusdcCoins } from '../features/shared/coin-utils';
import { fmtUsdc } from '../features/dashboard/format';
import { getExplorerObjectUrl } from '../lib/explorer';
import {
  buildProvideLiquidity,
  buildRequestWithdraw,
  buildRedeemLiquidity,
  MIN_LP_DEPOSIT_NUSDC,
} from '../features/lp/transactions';
import { RequestWithdrawModal } from '../features/lp/components/RequestWithdrawModal';
import { ProvideLiquidityModal } from '../features/lp/components/ProvideLiquidityModal';
import type { LpPositions } from '../lib/api/types';

/** Match the on-chain WITHDRAW_COOLDOWN_MS constant in bankroll_pool.move. */
const WITHDRAW_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const SHARE_PRICE_SCALE = 1_000_000_000n;

function fmtSharePrice(scaled: string): string {
  let n: bigint;
  try { n = BigInt(scaled); } catch { return '—'; }
  const whole = n / SHARE_PRICE_SCALE;
  const frac = (n % SHARE_PRICE_SCALE) / 100_000n;
  return `${whole.toString()}.${frac.toString().padStart(4, '0')}`;
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function DataQualityBadge({ quality }: { quality: DataQuality }) {
  if (quality === 'fresh') return null;
  const text = quality === 'lagging' ? 'Data sync delayed' : 'Data unavailable';
  const cls = quality === 'lagging'
    ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
    : 'bg-rose-500/15 text-rose-200 border-rose-400/30';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border ${cls}`}>
      {text}
    </span>
  );
}

export default function LiquidityPoolPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl text-gold">House Liquidity Pool</h1>
        <p className="text-base text-neutral-200 max-w-2xl">
          Provide NUSDC to back the GoStop house. Your share value tracks the
          pool's PnL across all non-lottery games. Soulbound LPToken; 24h cooldown
          on withdraw.
        </p>
      </header>
      <PoolOverviewSection />
      <DepositSection />
      <MyPositionsSection />
      <DisclosureSection />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Pool overview
// ──────────────────────────────────────────────────────────────────────────

function PoolOverviewSection() {
  const { data: pool, isLoading: poolLoading } = useLpPoolState();
  const { data: apy, isLoading: apyLoading } = useLpApy();

  if (poolLoading || !pool) {
    return (
      <section className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-3">Pool Overview</h2>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-ink-800 rounded" />
          ))}
        </div>
      </section>
    );
  }

  const dq: DataQuality = pool.data_quality;
  const hide = dq === 'unreliable';

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-display text-xl text-gold">Pool Overview</h2>
        <DataQualityBadge quality={dq} />
        {pool.paused && (
          <span
            title="Bets are paused. LP withdraw is NOT affected — you can still request and redeem."
            className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-amber-500/15 text-amber-200 border-amber-400/30"
          >
            Bets paused
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="TVL"
          value={hide ? '—' : `${fmtUsdc(pool.pool_balance)} NUSDC`}
        />
        <Stat
          label="Share price"
          value={hide ? '—' : fmtSharePrice(pool.share_price_scaled)}
          valueClass={hide ? 'text-neutral-300' : 'text-gold-200'}
        />
        <Stat
          label="7d APY"
          value={
            apyLoading
              ? '…'
              : apy && apy.apy_pct !== null
                ? `${apy.apy_pct.toFixed(2)}%`
                : '—'
          }
          subnote={apy?.apy_pct !== null ? 'estimate' : 'requires fresh data'}
        />
        <Stat
          label="Status"
          value={pool.is_seeded ? (pool.paused ? 'Bets paused' : 'Active') : 'Not seeded'}
          valueClass={
            !pool.is_seeded
              ? 'text-rose-300'
              : pool.paused
                ? 'text-amber-200'
                : 'text-emerald-300'
          }
        />
      </div>
    </section>
  );
}

function Stat({ label, value, valueClass = 'text-neutral-100', subnote }: {
  label: string;
  value: string;
  valueClass?: string;
  subnote?: string;
}) {
  return (
    <div>
      <span className="block text-xs uppercase tracking-widest text-neutral-300">{label}</span>
      <span className={`block font-mono text-base ${valueClass}`}>{value}</span>
      {subnote && <span className="block text-[10px] text-neutral-400">{subnote}</span>}
    </div>
  );
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

// ──────────────────────────────────────────────────────────────────────────
// Deposit
// ──────────────────────────────────────────────────────────────────────────

function DepositSection() {
  const { walletAddress, isWalletConnected, signAndExecute } = useSignAndExecute();
  const { data: pool } = useLpPoolState();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const balance = useBalanceStore((s) => s.totalNusdc);

  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Parse user input as decimal NUSDC and convert to base units. Returns null
  // when malformed. We accept up to 6 decimal places (chain precision).
  const amountBaseUnits = useMemo(() => {
    const t = amountText.trim();
    if (!t) return null;
    if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
    const [whole, frac = ''] = t.split('.');
    const padded = (frac + '000000').slice(0, 6);
    try {
      return BigInt(whole) * 1_000_000n + BigInt(padded || '0');
    } catch {
      return null;
    }
  }, [amountText]);

  const isSeeded = pool?.is_seeded === true;
  const poolPaused = pool?.paused === true;
  const dqOk = pool?.data_quality === 'fresh';
  const tooSmall = amountBaseUnits !== null && amountBaseUnits < MIN_LP_DEPOSIT_NUSDC;
  const insufficient = amountBaseUnits !== null && amountBaseUnits > balance;

  const canSubmit =
    isWalletConnected &&
    isSeeded &&
    !poolPaused &&
    dqOk &&
    amountBaseUnits !== null &&
    !tooSmall &&
    !insufficient &&
    !busy;

  const submit = async () => {
    if (!canSubmit || amountBaseUnits === null || !walletAddress) return;
    setBusy(true);
    try {
      const client = getSuiClient();
      const coins = await findNusdcCoins(client, walletAddress, amountBaseUnits);
      if (!coins) {
        showToast('Not enough NUSDC in wallet.', 'error');
        return;
      }
      const tx = buildProvideLiquidity(amountBaseUnits, coins.primary, coins.extra);

      // LockConflict / ObjectVersionMismatch retry once after 1500ms with
      // fresh object refs (plan v3 §5.5). Build a fresh Transaction on retry
      // — the previous one carries pre-fetched object versions.
      let attempt = 0;
      while (true) {
        try {
          await signAndExecute(attempt === 0 ? tx : buildProvideLiquidity(amountBaseUnits, coins.primary, coins.extra));
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const retriable = /LockConflict|ObjectVersionMismatch|ObjectNotFound/.test(msg);
          if (!retriable || attempt >= 1) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 1500));
          attempt++;
        }
      }

      showToast('Liquidity deposited. LP token issued to your wallet.', 'success');
      setAmountText('');
      setConfirmOpen(false);
      // Refresh pool state, positions, balance.
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Deposit failed: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-5">
      <h2 className="font-display text-xl text-gold mb-3">Provide Liquidity</h2>

      {!isWalletConnected && (
        <p className="text-sm text-neutral-200">Connect your wallet to deposit.</p>
      )}

      {isWalletConnected && (
        <div className="space-y-3 max-w-md">
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-neutral-300 mb-1">
              Amount (NUSDC)
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="10.000000"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="w-full bg-ink-900/60 border border-gold-subtle rounded-md px-3 py-2 text-base text-neutral-100 font-mono focus:outline-none focus:border-gold-300/50"
            />
            <span className="block text-xs text-neutral-300 mt-1">
              Wallet balance: <span className="font-mono">{fmtUsdc(balance)} NUSDC</span>
              {' · '}
              Minimum: <span className="font-mono">10 NUSDC</span>
            </span>
          </label>

          {tooSmall && (
            <p className="text-sm text-rose-300">Minimum deposit is 10 NUSDC.</p>
          )}
          {insufficient && (
            <p className="text-sm text-rose-300">Amount exceeds your NUSDC balance.</p>
          )}
          {!isSeeded && (
            <p className="text-sm text-amber-200">
              Pool is not yet seeded by admin. Deposits will reopen after seed_pool_shares.
            </p>
          )}
          {poolPaused && (
            <p className="text-sm text-amber-200">
              Bets are paused. New LP deposits are disabled while paused; existing LPs can still
              redeem after cooldown.
            </p>
          )}
          {!dqOk && (
            <p className="text-sm text-amber-200">
              Pool data is currently {pool?.data_quality ?? 'unavailable'}. Deposit is disabled
              until data quality recovers.
            </p>
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="w-full px-4 py-2 rounded-md bg-gold-400/90 hover:bg-gold-400 text-ink-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Deposit NUSDC
          </button>
        </div>
      )}
      {amountBaseUnits !== null && (
        <ProvideLiquidityModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={submit}
          amountBaseUnits={amountBaseUnits}
          sharePriceScaled={pool?.share_price_scaled}
          submitting={busy}
        />
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// My positions
// ──────────────────────────────────────────────────────────────────────────

function MyPositionsSection() {
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
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp'] });
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
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp'] });
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

// ──────────────────────────────────────────────────────────────────────────
// Disclosure / risk
// ──────────────────────────────────────────────────────────────────────────

function DisclosureSection() {
  return (
    <section className="panel p-5 text-sm text-neutral-300 space-y-2">
      <h2 className="font-display text-xl text-gold mb-2">How it works</h2>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <span className="text-neutral-100">Deposit NUSDC.</span> You receive a
          soulbound LPToken whose share count tracks the pool. Minimum 10 NUSDC.
        </li>
        <li>
          <span className="text-neutral-100">Pool earns from games.</span> Non-lottery
          house edge accrues into the pool balance, growing your share price.
          Lottery flows through its own prize_pool and does not affect LP shares
          (only its operator cut + unclaimed sweep credit treasury).
        </li>
        <li>
          <span className="text-neutral-100">Request withdraw.</span> Starts a 24h
          cooldown on chain. Bets pausing does NOT halt your exit.
        </li>
        <li>
          <span className="text-neutral-100">Redeem.</span> After cooldown, redeem
          to receive NUSDC. No deadline — your LPToken stays redeemable indefinitely
          once cooldown elapses. Calling Request again restarts the timer.
        </li>
      </ol>
      <p className="text-xs text-neutral-400 pt-2 border-t border-ink-800">
        Disclosure: house bankroll is exposed to game-level variance. Pool has no
        automated utilization cap in v1 — operator monitors exposure and can
        pause new bets manually (this does not affect your exit). NAV here is
        book value; in-flight bets are not subtracted. Higher-fidelity NAV is
        planned for v1.x.
      </p>
    </section>
  );
}
