/**
 * RecentTrades Component
 * Display user's recent trading history with Load More pagination
 */

import { useState, useMemo, useCallback } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTradeHistory, type UserTrade } from '../hooks/useTradeHistory';
import { generateCsv, downloadCsv } from '../../../lib/csv-export';
import { useNow } from '@/hooks/useNow';

const ITEMS_PER_PAGE = 5;

type SideFilter = 'all' | 'buy' | 'sell';
type PeriodFilter = '24h' | '7d' | '30d' | 'all';

const PERIOD_MS: Record<PeriodFilter, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': Infinity,
};

const TRADE_CSV_COLUMNS = [
  { header: 'Date', accessor: (t: UserTrade) => new Date(t.timestamp).toLocaleString('en-US') },
  { header: 'Market', accessor: (t: UserTrade) => t.poolName },
  { header: 'Side', accessor: (t: UserTrade) => t.side.toUpperCase() },
  { header: 'Price', accessor: (t: UserTrade) => t.price },
  { header: 'Amount', accessor: (t: UserTrade) => t.quantity },
  { header: 'Total', accessor: (t: UserTrade) => t.total },
  { header: 'Fee', accessor: (t: UserTrade) => t.fee },
  { header: 'Tx Digest', accessor: (t: UserTrade) => t.txDigest },
];

interface TradeRowProps {
  trade: UserTrade;
}

// Shared formatting functions
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPrice = (price: number) => {
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toFixed(4)}`;
};

const formatQuantity = (qty: number) => {
  if (qty < 0.0001) return qty.toExponential(2);
  if (qty < 1) return qty.toFixed(6);
  return qty.toFixed(4);
};

// Mobile card layout for trades
function TradeCard({ trade }: TradeRowProps) {
  const isBuy = trade.side === 'buy';
  const sideColor = isBuy
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const sideBg = isBuy
    ? 'bg-green-100 dark:bg-green-900/30'
    : 'bg-red-100 dark:bg-red-900/30';

  return (
    <div className="p-4 hover:bg-theme-bg-tertiary/30 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${sideBg} ${sideColor}`}>
            {trade.side.toUpperCase()}
          </span>
          <span className="font-medium">{trade.poolName}</span>
        </div>
        <span className="text-xs text-theme-text-muted">{formatTime(trade.timestamp)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-theme-text-secondary">
          {formatQuantity(trade.quantity)} @ {formatPrice(trade.price)}
        </span>
        <span className="font-medium">${trade.total.toFixed(2)}</span>
      </div>
    </div>
  );
}

// Desktop table row for trades
function TradeRow({ trade }: TradeRowProps) {
  const isBuy = trade.side === 'buy';
  const sideColor = isBuy
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const sideBg = isBuy
    ? 'bg-green-100 dark:bg-green-900/30'
    : 'bg-red-100 dark:bg-red-900/30';

  return (
    <tr className="hover:bg-theme-bg-tertiary/30 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${sideBg} ${sideColor}`}>
            {trade.side.toUpperCase()}
          </span>
          <span className="text-sm font-medium">{trade.poolName}</span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm">
        {formatPrice(trade.price)}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm">
        {formatQuantity(trade.quantity)}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm">
        ${trade.total.toFixed(2)}
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-theme-text-muted">
        {formatTime(trade.timestamp)}
      </td>
    </tr>
  );
}

// Shared filter bar used in both embedded and standalone modes
interface FilterBarProps {
  markets: string[];
  marketFilter: string;
  sideFilter: SideFilter;
  periodFilter: PeriodFilter;
  onMarketChange: (v: string) => void;
  onSideChange: (v: SideFilter) => void;
  onPeriodChange: (v: PeriodFilter) => void;
}

function TradeFilterBar({ markets, marketFilter, sideFilter, periodFilter, onMarketChange, onSideChange, onPeriodChange }: FilterBarProps) {
  return (
    <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-theme-border">
      <select
        value={marketFilter}
        onChange={(e) => onMarketChange(e.target.value)}
        className="text-xs bg-theme-bg-tertiary border border-theme-border rounded px-2 py-1 text-theme-text-secondary"
      >
        <option value="all">All Markets</option>
        {markets.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      <div className="flex gap-0.5 bg-theme-bg-tertiary rounded p-0.5">
        {(['all', 'buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onSideChange(s)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              sideFilter === s
                ? s === 'buy' ? 'bg-green-600 text-white' : s === 'sell' ? 'bg-red-600 text-white' : 'bg-pd1 text-white'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {s === 'all' ? 'All' : s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      <div className="flex gap-0.5 bg-theme-bg-tertiary rounded p-0.5">
        {(['24h', '7d', '30d', 'all'] as const).map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              periodFilter === p
                ? 'bg-pd1 text-white font-medium'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {p === 'all' ? 'All' : p.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

// Shared trade list content (table + cards + load more)
interface TradeListContentProps {
  filteredTrades: UserTrade[];
  displayedTrades: UserTrade[];
  hasMore: boolean;
  isExpanded: boolean;
  onLoadMore: () => void;
  onCollapse: () => void;
}

function TradeListContent({ filteredTrades, displayedTrades, hasMore, isExpanded, onLoadMore, onCollapse }: TradeListContentProps) {
  if (filteredTrades.length === 0) {
    return (
      <div className="p-8 text-center text-theme-text-muted">
        No trades match the current filters.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Card layout */}
      <div className="md:hidden divide-y divide-theme-border">
        {displayedTrades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-theme-text-secondary bg-theme-bg-tertiary/50">
            <tr>
              <th className="py-2 px-3 text-left font-medium">Side / Market</th>
              <th className="py-2 px-3 text-right font-medium">Price</th>
              <th className="py-2 px-3 text-right font-medium">Amount</th>
              <th className="py-2 px-3 text-right font-medium">Total</th>
              <th className="py-2 px-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border">
            {displayedTrades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </tbody>
        </table>
      </div>

      {(hasMore || isExpanded) && (
        <div className="p-4 border-t border-theme-border flex gap-2">
          {hasMore && (
            <button
              onClick={onLoadMore}
              className="flex-1 py-2 px-4 text-sm font-medium text-pd1 dark:text-pd3
                         bg-pd5 dark:bg-pd0/30 hover:bg-pd5 dark:hover:bg-pd0/30
                         rounded-lg transition-colors"
            >
              Load More
            </button>
          )}
          {isExpanded && (
            <button
              onClick={onCollapse}
              className="flex-1 py-2 px-4 text-sm font-medium text-theme-text-secondary
                         bg-theme-bg-tertiary hover:bg-theme-bg-tertiary/80
                         rounded-lg transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </>
  );
}

interface RecentTradesProps {
  /** When true, renders without container (for use in ActivityTabs) */
  embedded?: boolean;
}

export function RecentTrades({ embedded = false }: RecentTradesProps) {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { trades, isLoading, error, refetch } = useTradeHistory();
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const now = useNow();

  const isConnected = status === 'unlocked' || isZkConnected;

  // Derive unique market names from trades
  const markets = useMemo(() => {
    const set = new Set(trades.map((t) => t.poolName));
    return Array.from(set).sort();
  }, [trades]);

  // Apply filters
  const filteredTrades = useMemo(() => {
    const cutoff = periodFilter === 'all' ? 0 : now - PERIOD_MS[periodFilter];
    return trades.filter((t) => {
      if (marketFilter !== 'all' && t.poolName !== marketFilter) return false;
      if (sideFilter !== 'all' && t.side !== sideFilter) return false;
      if (t.timestamp < cutoff) return false;
      return true;
    });
  }, [trades, marketFilter, sideFilter, periodFilter, now]);

  const displayedTrades = filteredTrades.slice(0, displayCount);
  const hasMore = displayCount < filteredTrades.length;
  const isExpanded = displayCount > ITEMS_PER_PAGE;

  const handleLoadMore = () => {
    setDisplayCount((prev) => Math.min(prev + ITEMS_PER_PAGE, filteredTrades.length));
  };

  const handleCollapse = () => {
    setDisplayCount(ITEMS_PER_PAGE);
  };

  const handleExportCsv = useCallback(() => {
    if (filteredTrades.length === 0) return;
    const csv = generateCsv(filteredTrades, TRADE_CSV_COLUMNS);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `pado-trades-${date}.csv`);
  }, [filteredTrades]);

  const resetDisplayCount = () => setDisplayCount(ITEMS_PER_PAGE);
  const handleMarketChange = (v: string) => { setMarketFilter(v); resetDisplayCount(); };
  const handleSideChange = (v: SideFilter) => { setSideFilter(v); resetDisplayCount(); };
  const handlePeriodChange = (v: PeriodFilter) => { setPeriodFilter(v); resetDisplayCount(); };

  // Embedded mode: simplified rendering without container
  if (embedded) {
    if (!isConnected) {
      return (
        <div className="p-8 text-center text-theme-text-muted">
          Connect wallet to view your trade history
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="p-8 text-center text-theme-text-muted">
          Loading...
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-8 text-center">
          <div className="text-red-600 dark:text-red-400 mb-2">{error}</div>
          <button
            onClick={refetch}
            className="text-xs text-pd1 dark:text-pd3 hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }

    if (trades.length === 0) {
      return (
        <div className="p-8 text-center text-theme-text-muted">
          No trades yet. Start trading to see your history here.
        </div>
      );
    }

    return (
      <>
        <TradeFilterBar
          markets={markets}
          marketFilter={marketFilter}
          sideFilter={sideFilter}
          periodFilter={periodFilter}
          onMarketChange={handleMarketChange}
          onSideChange={handleSideChange}
          onPeriodChange={handlePeriodChange}
        />

        <div className="px-4 py-1 flex items-center gap-2 justify-end">
          <button
            onClick={handleExportCsv}
            disabled={filteredTrades.length === 0}
            className="text-xs text-theme-text-muted hover:text-theme-text-secondary disabled:opacity-40 transition-colors"
            title="Export filtered trades as CSV"
          >
            CSV
          </button>
          <span className="text-xs text-theme-text-muted">
            {displayedTrades.length}/{filteredTrades.length}
          </span>
        </div>

        <TradeListContent
          filteredTrades={filteredTrades}
          displayedTrades={displayedTrades}
          hasMore={hasMore}
          isExpanded={isExpanded}
          onLoadMore={handleLoadMore}
          onCollapse={handleCollapse}
        />
      </>
    );
  }

  // Standalone mode: full container with header
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border flex justify-between items-center">
          <h2 className="font-semibold">Trade History</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          Connect wallet to view your trade history
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border">
          <h2 className="font-semibold">Trade History</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border flex justify-between items-center">
          <h2 className="font-semibold">Trade History</h2>
          <button
            onClick={refetch}
            className="text-xs text-pd1 dark:text-pd3 hover:underline"
          >
            Retry
          </button>
        </div>
        <div className="p-8 text-center text-red-600 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border">
          <h2 className="font-semibold">Trade History</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          No trades yet. Start trading to see your history here.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-theme-border flex justify-between items-center">
        <h2 className="font-semibold">Trade History</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={filteredTrades.length === 0}
            className="text-xs text-theme-text-muted hover:text-theme-text-secondary disabled:opacity-40 transition-colors"
            title="Export filtered trades as CSV"
          >
            CSV
          </button>
          <span className="text-xs text-theme-text-muted">
            {displayedTrades.length}/{filteredTrades.length}
          </span>
        </div>
      </div>

      <TradeFilterBar
        markets={markets}
        marketFilter={marketFilter}
        sideFilter={sideFilter}
        periodFilter={periodFilter}
        onMarketChange={handleMarketChange}
        onSideChange={handleSideChange}
        onPeriodChange={handlePeriodChange}
      />

      <TradeListContent
        filteredTrades={filteredTrades}
        displayedTrades={displayedTrades}
        hasMore={hasMore}
        isExpanded={isExpanded}
        onLoadMore={handleLoadMore}
        onCollapse={handleCollapse}
      />
    </div>
  );
}
