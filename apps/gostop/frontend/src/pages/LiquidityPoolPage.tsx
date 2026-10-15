import { Link } from 'react-router-dom';
import { useLpPoolState, useLpApy } from '../lib/api/queries';
import type { DataQuality, LpReturnWindow } from '../lib/api/types';
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

/**
 * Windows rendered in Pool Overview, in the order shown. Must be a subset of
 * what /lp/apy returns in `windows`; a day count the backend does not report
 * renders as "requires fresh data" rather than throwing.
 */
const RETURN_WINDOW_DAYS = [7, 30] as const;

/**
 * One window's realized return.
 *
 * Deliberately shows `realized_pct` and never `annualized_pct`. The pool's
 * weekly PnL is mostly variance, and annualizing a 7-day result multiplies it
 * by 52, so the same arithmetic that printed "88% APY" prints a comparable
 * negative after one bad week. Two windows are shown side by side so a single
 * week cannot read as an expected rate.
 */
function ReturnStat({
  days,
  window: w,
  loading,
  emptyPool,
}: {
  days: number;
  window: LpReturnWindow | undefined;
  loading: boolean;
  /** Pool balance is zero on fresh data, so the percentage has no divisor. */
  emptyPool: boolean;
}) {
  const pct = w?.realized_pct ?? null;
  const sign = pct !== null && pct > 0 ? '+' : '';
  // Four distinct states. A window the backend never reported means its
  // aggregate failed or the day counts drifted apart; a window it reported as
  // null means the data-quality gate withheld it; and computeRealizedPct also
  // returns null for a zero TVL, which is an empty pool rather than anything
  // being stale. Collapsing these would blame the indexer for a drained pool.
  const subnote = loading
    ? undefined
    : pct !== null
      ? 'realized, not annualized'
      : w === undefined
        ? 'window unavailable'
        : emptyPool
          ? 'no pool balance'
          : 'requires fresh data';
  return (
    <Stat
      label={`${days}d return`}
      value={loading ? '…' : pct !== null ? `${sign}${pct.toFixed(2)}%` : '—'}
      valueClass={
        pct === null || pct === 0
          ? 'text-neutral-100'
          : pct > 0
            ? 'text-emerald-300'
            : 'text-rose-300'
      }
      subnote={subnote}
      title={`House PnL over the last ${days} days divided by the pool's current size. Not annualized. A large recent deposit raises the divisor without changing house performance, so it understates the figure.`}
    />
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
            title="Bets are paused. LP withdraw is NOT affected: you can still request and redeem."
            className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-amber-500/15 text-amber-200 border-amber-400/30"
          >
            Bets paused
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat
          label="TVL"
          value={hide ? '—' : `${fmtUsdc(pool.pool_balance)} NUSDC`}
        />
        <Stat
          label="Share price"
          value={hide ? '—' : fmtSharePrice(pool.share_price_scaled)}
          valueClass={hide ? 'text-neutral-300' : 'text-gold-200'}
        />
        {RETURN_WINDOW_DAYS.map((days) => (
          <ReturnStat
            key={days}
            days={days}
            window={apy?.windows?.find((w) => w.days === days)}
            loading={apyLoading}
            emptyPool={apy?.data_quality === 'fresh' && apy.tvl_approx === '0'}
          />
        ))}
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

export function Stat({ label, value, valueClass = 'text-neutral-100', subnote, title }: {
  label: string;
  value: string;
  valueClass?: string;
  subnote?: string;
  /** Hover explanation. Renders a help cursor so the affordance is visible. */
  title?: string;
}) {
  return (
    <div title={title} className={title ? 'cursor-help' : undefined}>
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
          to receive NUSDC. No deadline, your LPToken stays redeemable indefinitely
          once cooldown elapses. Calling Request again restarts the timer.
        </li>
      </ol>
      <p className="text-xs text-neutral-400 pt-2 border-t border-ink-800">
        Disclosure: house bankroll is exposed to game-level variance. Every bet
        reserves its maximum payout on chain, and while a utilization cap is set
        the contract refuses any bet that would reserve past it. The cap is
        operator-set and can be set to zero, which disables that check, so treat
        the live value on the{' '}
        <Link to="/transparency" className="underline hover:text-gold-200">
          Transparency
        </Link>{' '}
        page as the authority rather than this paragraph. The operator can also
        pause new bets, which does not affect your exit. Share price here is
        book value: reserved payouts for in-flight rounds are not subtracted, so
        a cap, when set, is also what bounds how far book value can sit above
        what the pool would owe if every open round paid out. Returns above
        divide the window's house PnL by the pool's current size, so a large
        recent deposit understates them. Higher-fidelity NAV and a
        time-weighted return are planned for v1.x.
      </p>
    </section>
  );
}
