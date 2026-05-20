/**
 * TopLpConcentration — Tier 1 post-cleanup §A LP concentration card.
 *
 * Renders the top-5 LP positions by net shares. Public payload from
 * `/api/gostop/transparency` always masks raw addresses (N7 compliance).
 * When the viewer is authenticated, their own wallet is matched against the
 * server-provided SHA-256 hash so the "(you)" badge highlights the correct
 * row WITHOUT the server ever including the raw address in the public list.
 *
 * Self-position rank (and self-share %) is sourced from the separate
 * `/api/gostop/me/lp/position` endpoint (JWT-gated, no-store), so a viewer
 * who is OUTSIDE the top 5 still sees their rank if they want it — though
 * v1 only surfaces it as a small note under the list. The full LP page is
 * still the right place to operate on the position.
 */

import { useEffect, useMemo, useState } from 'react';
import type { RiskMetricsBlock, TopLpEntry, MeLpPosition } from '../../lib/api/types';
import { useMeLpPosition } from '../../lib/api/queries';
import { useGostopAuth } from '../../hooks/useGostopAuth';
import { bpsToPct, fmtUsdc } from '../dashboard/format';

interface Props {
  risk: RiskMetricsBlock;
}

/**
 * SHA-256 of lowercased wallet, first 16 hex chars. Mirrors backend
 * `walletHash` (api/lib/risk-metrics.ts). Async because SubtleCrypto is async;
 * we cache the result in state so the comparison happens once per wallet.
 */
async function walletHashHex(addr: string): Promise<string> {
  const bytes = new TextEncoder().encode(addr.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

export function TopLpConcentration({ risk }: Props) {
  const { walletAddress } = useGostopAuth();
  const meLpQuery = useMeLpPosition();
  const me: MeLpPosition | undefined = meLpQuery.data;

  // Resolve viewer's wallet hash for self-match against the public list.
  const [viewerHash, setViewerHash] = useState<string | null>(null);
  useEffect(() => {
    if (!walletAddress) {
      setViewerHash(null);
      return;
    }
    let cancelled = false;
    walletHashHex(walletAddress).then((h) => {
      if (!cancelled) setViewerHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const unreliable = risk.data_quality === 'unreliable';
  const entries = unreliable ? [] : risk.top_lp_5;
  const empty = entries.length === 0;
  const concentration = unreliable ? undefined : risk.lp_concentration;

  const selfRow = useMemo(() => {
    if (!viewerHash) return null;
    return entries.find((e) => e.address_hash === viewerHash) ?? null;
  }, [entries, viewerHash]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-base text-gold-200">Top LP concentration</h3>
          <ConcentrationBadge concentration={concentration} />
        </div>
        <span className="text-sm text-neutral-300">
          Top 5 by share, public + masked.
        </span>
      </div>

      {empty && (
        <p className="text-sm text-neutral-300">
          {unreliable
            ? 'Data unavailable.'
            : 'No LP positions yet. Concentration view appears once liquidity is provided.'}
        </p>
      )}

      {!empty && (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <LpRow key={e.address_hash} entry={e} isSelf={!!selfRow && selfRow.address_hash === e.address_hash} />
          ))}
        </ul>
      )}

      {/* Self position note for viewers OUTSIDE the top 5. */}
      {me && me.net_shares !== '0' && me.rank_in_top_5 === null && (
        <p className="text-xs text-neutral-300">
          Your position: <span className="font-mono text-neutral-100">{fmtUsdc(me.net_shares)}</span> shares
          ({bpsToPct(me.share_pct_bps)}). Outside the top 5.
        </p>
      )}
      {!walletAddress && (
        <p className="text-xs text-neutral-300">
          Connect a wallet to see your own position highlighted.
        </p>
      )}
    </div>
  );
}

function ConcentrationBadge({
  concentration,
}: {
  concentration: RiskMetricsBlock['lp_concentration'];
}) {
  if (!concentration || concentration.status === 'unknown' || concentration.status === 'healthy') {
    return null;
  }
  const isExtreme = concentration.status === 'extreme';
  const palette = isExtreme
    ? 'border-rose-400/70 bg-rose-500/15 text-rose-100'
    : 'border-amber-400/70 bg-amber-500/15 text-amber-100';
  const label = isExtreme ? 'Extreme concentration' : 'Concentrated';
  const pct = bpsToPct(concentration.top1_share_pct_bps);
  return (
    <span
      className={`text-sm uppercase tracking-wider px-2 py-0.5 rounded border ${palette}`}
      title={`Rank-1 LP holds ${pct} of all LP shares. Single-LP withdraw can move share_price.`}
    >
      {label} · top1 {pct}
    </span>
  );
}

function LpRow({ entry, isSelf }: { entry: TopLpEntry; isSelf: boolean }) {
  return (
    <li
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border ${
        isSelf
          ? 'border-gold-300/60 bg-gold-400/10'
          : 'border-gold-subtle bg-ink-900/40'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm text-neutral-300 w-6 text-right">#{entry.rank}</span>
        <span className="font-mono text-sm text-neutral-100 truncate">{entry.address_masked}</span>
        {isSelf && (
          <span className="text-[10px] uppercase tracking-wider text-gold-100 bg-gold-300/30 border border-gold-300/60 px-1.5 py-0.5 rounded">
            you
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3 shrink-0">
        <span className="font-mono text-sm text-gold-200">{bpsToPct(entry.share_pct_bps)}</span>
        <span className="font-mono text-xs text-neutral-300">{fmtUsdc(entry.shares)} sh</span>
      </div>
    </li>
  );
}
