import { Link } from 'react-router-dom';
import { useLpPositions } from '../../../lib/api/queries';
import { useGostopAuth } from '../../../hooks/useGostopAuth';
import { getExplorerObjectUrl } from '../../../lib/explorer';
import { fmtUsdc } from '../format';
import type { LpPosition } from '../../../lib/api/types';

const MAX_ROWS = 3;

export function MyLiquidityCard() {
  const { walletAddress } = useGostopAuth();
  const { data, isLoading, isError, error, refetch } = useLpPositions(walletAddress);

  if (!walletAddress) return null;

  if (isLoading) {
    return (
      <div className="panel p-5 animate-pulse space-y-3">
        <div className="h-6 w-32 bg-ink-800 rounded" />
        <div className="h-16 bg-ink-800 rounded" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-2">My Liquidity</h2>
        <p className="text-sm text-rose-300">{error?.message ?? 'Failed to load'}</p>
        <button onClick={() => void refetch()} className="mt-2 text-sm text-gold-200 hover:text-gold-100">
          Retry
        </button>
      </div>
    );
  }

  const positions = data?.positions ?? [];
  const totals = positions.reduce(
    (acc, p) => {
      acc.shares += BigInt(p.shares);
      acc.value  += BigInt(p.estimated_value_nusdc);
      return acc;
    },
    { shares: 0n, value: 0n },
  );
  const shown = positions.slice(0, MAX_ROWS);
  const hidden = positions.length - shown.length;

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-gold">My Liquidity</h2>
        <Link to="/lp" className="text-sm text-gold-200 hover:text-gold-100">
          Manage →
        </Link>
      </div>

      {positions.length === 0 && (
        <p className="text-sm text-neutral-200">
          No LP positions yet.{' '}
          <Link to="/lp" className="text-gold-200 hover:text-gold-100 underline">
            Provide liquidity
          </Link>{' '}
          to earn a share of bankroll yield.
        </p>
      )}

      {positions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Positions" value={String(positions.length)} />
            <Stat
              label="Total value"
              value={`${fmtUsdc(totals.value.toString())} NUSDC`}
              valueClass="text-gold-200"
            />
          </div>
          <ul className="space-y-2">
            {shown.map((p) => <Row key={p.lp_token_id} position={p} />)}
          </ul>
          {hidden > 0 && (
            <p className="text-sm text-neutral-300">
              +{hidden} more on{' '}
              <Link to="/lp" className="text-gold-200 hover:text-gold-100 underline">
                /lp
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Row({ position: p }: { position: LpPosition }) {
  // Stage matches /lp PositionCard convention so the two views read consistently.
  const stage: 'idle' | 'cooling' | 'claimable' = p.claimable_at_ms === null
    ? 'idle'
    : Number(p.claimable_at_ms) > Date.now()
      ? 'cooling'
      : 'claimable';
  const stageLabel = stage === 'idle' ? 'Idle' : stage === 'cooling' ? 'Cooldown' : 'Ready';
  const stageClass =
    stage === 'claimable' ? 'text-emerald-300' :
    stage === 'cooling'   ? 'text-amber-200' :
    'text-neutral-200';

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-gold-subtle bg-ink-900/40">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-mono text-neutral-100 truncate">
          {p.lp_token_id.slice(0, 10)}…{p.lp_token_id.slice(-4)}
        </span>
        <a
          href={getExplorerObjectUrl(p.lp_token_id)}
          target="_blank"
          rel="noopener noreferrer"
          title="View LPToken on Nasun Explorer"
          aria-label="View LPToken on Nasun Explorer"
          className="inline-flex items-center text-neutral-300 hover:text-gold-200 transition-colors shrink-0"
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
      <div className="flex items-baseline gap-3 shrink-0">
        <span className="text-sm font-mono text-gold-200">
          {fmtUsdc(p.estimated_value_nusdc)}
        </span>
        <span className={`text-sm ${stageClass}`}>{stageLabel}</span>
      </div>
    </li>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-sm uppercase tracking-widest text-neutral-300 mb-1">{label}</div>
      <div className={`font-mono text-base ${valueClass ?? 'text-neutral-100'}`}>{value}</div>
    </div>
  );
}
