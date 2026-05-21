import { useLpPoolState, useLpApy } from '../lib/api/queries';
import type { DataQuality } from '../lib/api/types';
import { fmtSharePrice, fmtUsdc } from '../features/dashboard/format';
import { DepositSection } from '../features/lp/components/DepositSection';
import { MyPositionsSection } from '../features/lp/components/MyPositionsSection';


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

export function Stat({ label, value, valueClass = 'text-neutral-100', subnote }: {
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
