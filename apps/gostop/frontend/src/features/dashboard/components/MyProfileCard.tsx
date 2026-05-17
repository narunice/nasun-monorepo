import { useState } from 'react';
import { useMeProfile } from '../../../lib/api/queries';
import { fmtAbsoluteTime, fmtUsdc, fmtUsdcSigned, shortWallet } from '../format';

interface HealthBarProps {
  label: string;
  value: number | null;
}

function HealthBar({ label, value }: HealthBarProps) {
  const pct = value === null ? null : Math.max(0, Math.min(100, value));
  const tone =
    pct === null ? 'bg-neutral-700'
    : pct >= 70 ? 'bg-emerald-500/70'
    : pct >= 40 ? 'bg-amber-500/70'
    : 'bg-rose-500/70';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-widest text-neutral-300">{label}</span>
        <span className="text-sm font-mono text-neutral-100">
          {pct === null ? 'no NFT' : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
        <div className={`h-full transition-all ${tone}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  const [errored, setErrored] = useState(false);
  const initials = name?.trim().slice(0, 1).toUpperCase() ?? '?';

  if (url && !errored) {
    return (
      <img
        src={url}
        alt={name ?? 'avatar'}
        className="w-12 h-12 rounded-full object-cover ring-1 ring-gold-subtle flex-shrink-0"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-full flex-shrink-0 bg-gold-400/15 ring-1 ring-gold-subtle flex items-center justify-center">
      <span className="font-display text-lg text-gold-300">{initials}</span>
    </div>
  );
}

export function MyProfileCard() {
  const { data, isLoading, isError, error, refetch } = useMeProfile();

  if (isLoading) return <SkeletonCard />;
  if (isError) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-2">My Profile</h2>
        <p className="text-sm text-rose-300">Failed to load profile: {error.message}</p>
        <button onClick={() => refetch()} className="mt-3 text-sm text-gold-200 hover:text-gold-100">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const totalRounds = data.total_rounds;
  const isEmpty = totalRounds === 0;
  const hasIdentity = !!(data.display_name || data.x_handle);

  return (
    <div className="panel p-5 space-y-4">
      {/* Identity header */}
      <div className="flex items-start gap-3">
        <Avatar url={data.profile_image_url} name={data.display_name} />
        <div className="flex-1 min-w-0">
          {hasIdentity ? (
            <>
              <h2 className="font-display text-xl text-gold leading-tight truncate">
                {data.display_name ?? shortWallet(data.wallet)}
              </h2>
              {data.x_handle && (
                <p className="text-sm text-neutral-300 mt-0.5">@{data.x_handle}</p>
              )}
              <p className="font-mono text-xs text-neutral-400 mt-0.5">{shortWallet(data.wallet)}</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl text-gold leading-tight">My Profile</h2>
              <p className="font-mono text-sm text-neutral-300 mt-1">{shortWallet(data.wallet)}</p>
            </>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xs uppercase tracking-widest text-neutral-300 block">
            Nasun Points
          </span>
          <span className="font-display text-2xl text-gold-200">
            {data.ecosystem_points.toLocaleString('en-US')}
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-gold-subtle bg-gold-400/5 p-4 text-sm text-neutral-200">
          No rounds played yet. Head to the Floor to start.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Rounds" value={totalRounds.toLocaleString('en-US')} />
          <Stat label="Total Bet" value={fmtUsdc(data.total_bet)} suffix="N" />
          <Stat label="Total Payout" value={fmtUsdc(data.total_payout)} suffix="N" />
          <Stat
            label="Net PnL"
            value={fmtUsdcSigned(data.net_pnl)}
            suffix="N"
            tone={BigInt(data.net_pnl) >= 0n ? 'positive' : 'negative'}
          />
        </div>
      )}

      {(data.nft_health?.alliance !== undefined || data.nft_health?.genesis_pass !== undefined) && (
        <div className="space-y-3 pt-2">
          <HealthBar label="Alliance Health" value={data.nft_health?.alliance ?? null} />
          <HealthBar label="Genesis Pass" value={data.nft_health?.genesis_pass ?? null} />
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-300 pt-2 border-t border-gold-subtle">
        <span>First played: {fmtAbsoluteTime(data.first_played_ms)}</span>
        <span>Last: {fmtAbsoluteTime(data.last_played_ms)}</span>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'positive' | 'negative';
}

function Stat({ label, value, suffix, tone }: StatProps) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-300'
    : tone === 'negative' ? 'text-rose-300'
    : 'text-gold-200';
  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-neutral-300 block">{label}</span>
      <span className={`font-mono text-base ${toneClass}`}>{value}</span>
      {suffix && <span className="ml-1 text-xs text-neutral-300">{suffix}</span>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="panel p-5 space-y-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-ink-800 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 bg-ink-800 rounded" />
          <div className="h-4 w-24 bg-ink-800 rounded" />
        </div>
        <div className="h-8 w-16 bg-ink-800 rounded" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-ink-800 rounded" />
        ))}
      </div>
    </div>
  );
}
