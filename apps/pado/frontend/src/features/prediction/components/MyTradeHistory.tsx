/**
 * MyTradeHistory: user's own filled orders for a market.
 *
 * Visual sibling of RecentTradesFeed but scoped to the connected wallet. Drops
 * the live pulse dot (own trades aren't a live signal) and adds a tx-digest
 * external link.
 */

import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useMyTradeHistory } from '../hooks/useMyTradeHistory';
import type { TradeHistoryRow } from '../types';
import { formatTimeAgo } from '@/lib/format';
import { getExplorerTxUrl } from '@/lib/explorer';

interface Props {
  marketId: string;
}

const VISIBLE_LIMIT = 30;

function Row({ row }: { row: TradeHistoryRow }) {
  const side = row.isBuy
    ? row.isYes ? 'BUY YES' : 'BUY NO'
    : row.isYes ? 'SELL YES' : 'SELL NO';
  const price = (row.priceBps / 10000).toFixed(2);
  const shares = (Number(row.fillShares) / 1_000_000).toFixed(2);
  const borderColor = row.isBuy
    ? 'var(--color-predict-yes-bar)'
    : 'var(--color-predict-no-bar)';
  const sideColor = row.isBuy ? 'text-predict-yes' : 'text-predict-no';
  const txUrl = row.txDigest ? getExplorerTxUrl(row.txDigest) : null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-l-2 transition-colors duration-150 hover:bg-theme-bg-primary/40"
      style={{ borderLeftColor: borderColor }}
    >
      <span className={`shrink-0 text-[10px] font-bold font-mono tracking-wider w-16 ${sideColor}`}>
        {side}
      </span>
      <span className="shrink-0 font-mono text-xs text-theme-text-primary tabular-nums w-12">
        ${price}
      </span>
      <span className="flex-1 font-mono text-xs text-theme-text-muted tabular-nums text-right">
        {shares}
      </span>
      <span className="shrink-0 text-[10px] text-theme-text-muted/60 w-12 text-right">
        {formatTimeAgo(row.timestamp)}
      </span>
      {txUrl ? (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-theme-text-muted/60 hover:text-theme-text-secondary"
          title="View transaction"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      ) : (
        <span className="shrink-0 w-3" />
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-l-2 border-theme-border animate-pulse">
      <div className="h-2.5 w-16 bg-theme-bg-tertiary rounded" />
      <div className="h-2.5 w-10 bg-theme-bg-tertiary rounded" />
      <div className="flex-1 flex justify-end">
        <div className="h-2.5 w-12 bg-theme-bg-tertiary rounded" />
      </div>
      <div className="h-2.5 w-10 bg-theme-bg-tertiary rounded" />
    </div>
  );
}

export function MyTradeHistory({ marketId }: Props) {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);

  const owner = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const { data: rows = [], isLoading } = useMyTradeHistory(marketId, owner);
  if (!owner) return null;

  const visible = rows.slice(0, VISIBLE_LIMIT);

  return (
    <div className="bg-theme-bg-secondary rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border/50">
        <span className="text-xs font-medium text-theme-text-secondary tracking-wide uppercase">
          My Trades
        </span>
        <div className="flex gap-2 text-[10px] font-mono text-theme-text-muted/50 uppercase tracking-wider">
          <span className="w-16">Side</span>
          <span className="w-12">Price</span>
          <span className="w-12 text-right">Shares</span>
          <span className="w-12 text-right">Time</span>
          <span className="w-3" />
        </div>
      </div>

      <div className="divide-y divide-theme-border/20">
        {isLoading ? (
          Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} />)
        ) : visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-theme-text-muted/50">
            No trades yet. Your filled orders will appear here.
          </div>
        ) : (
          visible.map((row) => (
            <Row key={`${row.orderId}-${row.timestamp}-${row.isTaker ? 't' : 'm'}`} row={row} />
          ))
        )}
      </div>
    </div>
  );
}
