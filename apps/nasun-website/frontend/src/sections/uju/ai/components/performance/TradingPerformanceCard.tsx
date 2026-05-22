/**
 * TradingPerformanceCard - spot trading P&L for a single agent.
 *
 * Pulls every cap-gated escrow swap tx (queryTransactionBlocks scoped to
 * the agent's escrow) and folds them into per-asset FIFO cost basis.
 * Combined with oracle mark prices, surfaces Portfolio Value + Realized P&L
 * + Unrealized P&L for the Overview tab.
 *
 * Prediction positions are intentionally excluded: the agent build covered
 * by this card only does spot. Add a prediction section here when (a) the
 * agent gains prediction capability and (b) there's an authoritative source
 * for prediction P&L (escrow events don't cover prediction settle paths
 * today).
 */
import { useMemo } from 'react';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import { useCapability } from '../../hooks/useCapability';
import {
  useAgentSpotTrades,
  type SpotTrade,
} from '../../hooks/useAgentSpotTrades';
import { useTokenPrices, type SpotTokenSymbol } from '../../hooks/useTokenPrices';

interface TradingPerformanceCardProps {
  agent: AgentProfile;
}

// Decimal places per base/quote asset. Sourced from @nasun/devnet-config
// constants but inlined to avoid coupling this card to a config rebuild for
// new tokens. NUSDC is always the quote.
const QUOTE_DECIMALS = 6;
const BASE_DECIMALS: Record<string, number> = {
  NBTC: 8,
  NETH: 8,
  NSOL: 8,
  NSN: 9,
  NASUN: 9, // alias for NSN type tag
};

// Map raw type-tag symbol to the symbol the oracle/price hook keys on. Two
// reasons this isn't an identity map: (a) the on-chain NSN module is named
// `nasun::NASUN` so the symbolic last segment is NASUN, not NSN, and (b)
// we want a single concept of "this is the gas/native token" in price code.
function priceSymbolFor(baseSymbol: string): SpotTokenSymbol | null {
  if (baseSymbol === 'NBTC' || baseSymbol === 'NETH' || baseSymbol === 'NSOL') {
    return baseSymbol;
  }
  if (baseSymbol === 'NSN' || baseSymbol === 'NASUN') return 'NSN';
  return null;
}

interface PerAssetStats {
  symbol: string;
  /** Cumulative bought in display units. */
  totalBought: number;
  /** Cumulative sold in display units. */
  totalSold: number;
  /** FIFO weighted average buy price in USD. 0 if no buys yet. */
  avgBuyPrice: number;
  /** Net realized P&L in USD across all sells. */
  realizedPnl: number;
  /** Net holding = bought - sold, display units. */
  holding: number;
  /** Current mark price; null if oracle missing. */
  markPrice: number | null;
  /** (mark - avg_buy) * holding; null when no mark or no holding. */
  unrealizedPnl: number | null;
  /** Current mark value in USD; null when unmarkable. */
  markValueUsd: number | null;
}

function deriveStats(
  trades: SpotTrade[],
  prices: Record<SpotTokenSymbol, number | null>,
): PerAssetStats[] {
  // Group trades by base symbol, then fold chronologically.
  const byBase = new Map<string, SpotTrade[]>();
  for (const t of trades) {
    const arr = byBase.get(t.baseSymbol);
    if (arr) arr.push(t);
    else byBase.set(t.baseSymbol, [t]);
  }

  const out: PerAssetStats[] = [];
  for (const [symbol, list] of byBase) {
    const baseDecimals = BASE_DECIMALS[symbol] ?? 8;
    const baseScale = Math.pow(10, baseDecimals);
    const quoteScale = Math.pow(10, QUOTE_DECIMALS);

    let totalBought = 0;
    let totalSold = 0;
    let avgBuyPrice = 0;
    let realizedPnl = 0;

    // Trades are pre-sorted oldest-first by useAgentSpotTrades.
    for (const t of list) {
      const baseQty = Number(t.baseQtyRaw) / baseScale;
      const quoteUsd = Number(t.quoteRaw) / quoteScale;
      if (baseQty <= 0 || quoteUsd <= 0) continue;
      if (t.side === 'BUY') {
        // Roll the weighted average over the new combined holding. We use
        // (prev_holding = bought - sold) as the basis so sells reset the
        // averaging weight - a re-entry after fully exiting starts fresh
        // at the new buy price, matching how a trader thinks about cost.
        const prevHolding = totalBought - totalSold;
        const newHolding = prevHolding + baseQty;
        avgBuyPrice =
          newHolding > 0
            ? (avgBuyPrice * prevHolding + quoteUsd) / newHolding
            : 0;
        totalBought += baseQty;
      } else {
        // realized P&L = received USD - cost basis of what we sold
        realizedPnl += quoteUsd - avgBuyPrice * baseQty;
        totalSold += baseQty;
      }
    }

    const holding = totalBought - totalSold;
    const priceKey = priceSymbolFor(symbol);
    const markPrice = priceKey ? prices[priceKey] ?? null : null;
    const markValueUsd = markPrice != null && holding > 0 ? markPrice * holding : null;
    const unrealizedPnl =
      markPrice != null && holding > 0 ? (markPrice - avgBuyPrice) * holding : null;

    out.push({
      symbol,
      totalBought,
      totalSold,
      avgBuyPrice,
      realizedPnl,
      holding,
      markPrice,
      unrealizedPnl,
      markValueUsd,
    });
  }
  // Heaviest exposure first.
  out.sort((a, b) => {
    const av = (a.markValueUsd ?? 0) + Math.abs(a.realizedPnl);
    const bv = (b.markValueUsd ?? 0) + Math.abs(b.realizedPnl);
    return bv - av;
  });
  return out;
}

function formatUsd(n: number | null | undefined, opts?: { showSign?: boolean }): string {
  if (n == null || !Number.isFinite(n)) return '-';
  const sign = opts?.showSign && n > 0 ? '+' : '';
  return `${sign}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function pnlColor(n: number | null | undefined): string {
  if (n == null || n === 0) return 'text-uju-secondary';
  return n > 0 ? 'text-emerald-400' : 'text-red-400';
}

function formatQty(qty: number, decimals: number): string {
  if (!Number.isFinite(qty)) return '-';
  const precision = Math.min(decimals, 6);
  return qty.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: precision });
}

export function TradingPerformanceCard({ agent }: TradingPerformanceCardProps) {
  const capability = useCapability(agent.capabilityId);
  const escrowId = capability.data?.escrowId ?? null;
  const { trades, isLoading: tradesLoading } = useAgentSpotTrades(escrowId);
  const priceMap = useTokenPrices();

  const stats = useMemo(
    () => deriveStats(trades, priceMap.prices),
    [trades, priceMap.prices],
  );

  const totalRealized = stats.reduce((s, a) => s + a.realizedPnl, 0);
  const totalUnrealized = stats.reduce((s, a) => s + (a.unrealizedPnl ?? 0), 0);
  const totalMarkValue = stats.reduce((s, a) => s + (a.markValueUsd ?? 0), 0);
  const totalPnl = totalRealized + totalUnrealized;
  const hasAnyHoldingUnmarked = stats.some(
    (a) => a.holding > 0 && a.markValueUsd == null,
  );
  const everyHoldingUnmarked =
    stats.length > 0 &&
    stats.every((a) => a.holding > 0 && a.markValueUsd == null);

  // Rough P&L % against active capital base. Ignores deposits/withdraws -
  // labeled "P&L %" not "ROI" to make that expectation explicit.
  const pnlPct = useMemo(() => {
    const denom = totalMarkValue + Math.abs(totalRealized);
    if (denom <= 0) return null;
    return (totalPnl / denom) * 100;
  }, [totalMarkValue, totalRealized, totalPnl]);

  const isLoading = capability.isLoading || tradesLoading || priceMap.isLoading;
  const hasTrades = trades.length > 0;

  return (
    <section className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-4">
      <Header isLoading={isLoading} tradeCount={trades.length} />

      {!escrowId && !isLoading && (
        <p className="text-sm text-uju-secondary">
          This agent has no escrow yet, so no trading capital has been deposited.
        </p>
      )}

      {escrowId && hasTrades && (
        <>
          <SummaryGrid
            portfolioValue={totalMarkValue}
            hidePortfolioValue={everyHoldingUnmarked}
            realized={totalRealized}
            unrealized={totalUnrealized}
            totalPnl={totalPnl}
            pnlPct={pnlPct}
          />
          <SpotTable stats={stats} />
          {hasAnyHoldingUnmarked && !everyHoldingUnmarked && (
            <p className="text-xs text-uju-secondary/70">
              Some holdings could not be marked (oracle feed missing).
            </p>
          )}
        </>
      )}

      {escrowId && !hasTrades && !isLoading && <EmptyState />}
    </section>
  );
}

function Header({ isLoading, tradeCount }: { isLoading: boolean; tradeCount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white">Trading Performance</h3>
        <p className="text-xs text-uju-secondary mt-0.5">
          Pado spot fills from this agent&apos;s escrow, marked to oracle prices.
          {tradeCount > 0 && ` ${tradeCount} fill${tradeCount === 1 ? '' : 's'} to date.`}
        </p>
      </div>
      {isLoading && <span className="text-xs text-uju-secondary/70">Refreshing...</span>}
    </div>
  );
}

interface SummaryGridProps {
  portfolioValue: number;
  hidePortfolioValue: boolean;
  realized: number;
  unrealized: number;
  totalPnl: number;
  pnlPct: number | null;
}

function SummaryGrid({
  portfolioValue,
  hidePortfolioValue,
  realized,
  unrealized,
  totalPnl,
  pnlPct,
}: SummaryGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-uju-border/60">
      <Stat
        label="Portfolio Value"
        value={hidePortfolioValue ? '-' : formatUsd(portfolioValue)}
        hint={hidePortfolioValue ? 'oracle unavailable' : undefined}
      />
      <Stat
        label="Realized P&L"
        value={formatUsd(realized, { showSign: true })}
        valueClass={pnlColor(realized)}
      />
      <Stat
        label="Unrealized P&L"
        value={formatUsd(unrealized, { showSign: true })}
        valueClass={pnlColor(unrealized)}
      />
      <Stat
        label="Total P&L"
        value={formatUsd(totalPnl, { showSign: true })}
        valueClass={pnlColor(totalPnl)}
        hint={pnlPct != null ? formatPct(pnlPct) : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wider text-uju-secondary/70">{label}</p>
      <p className={`text-sm truncate mt-0.5 ${valueClass ?? 'text-white'}`}>{value}</p>
      {hint && <p className="text-xs text-uju-secondary/60 mt-0.5">{hint}</p>}
    </div>
  );
}

function SpotTable({ stats }: { stats: PerAssetStats[] }) {
  return (
    <div className="pt-3 border-t border-uju-border/60 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-uju-secondary/70 text-left">
            <th className="font-normal py-1">Token</th>
            <th className="font-normal py-1 text-right">Holding</th>
            <th className="font-normal py-1 text-right">Avg Buy</th>
            <th className="font-normal py-1 text-right">Mark</th>
            <th className="font-normal py-1 text-right">Unrealized</th>
            <th className="font-normal py-1 text-right">Realized</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => {
            const baseDecimals = BASE_DECIMALS[s.symbol] ?? 8;
            return (
              <tr key={s.symbol} className="border-t border-uju-border/30">
                <td className="py-1.5 text-white">{s.symbol}</td>
                <td className="py-1.5 text-right text-white/90">
                  {s.holding > 0 ? formatQty(s.holding, baseDecimals) : '0'}
                </td>
                <td className="py-1.5 text-right text-white/90">
                  {s.totalBought > 0 ? formatUsd(s.avgBuyPrice) : '-'}
                </td>
                <td className="py-1.5 text-right text-white/90">
                  {s.markPrice != null ? formatUsd(s.markPrice) : '-'}
                </td>
                <td className={`py-1.5 text-right ${pnlColor(s.unrealizedPnl)}`}>
                  {formatUsd(s.unrealizedPnl, { showSign: true })}
                </td>
                <td className={`py-1.5 text-right ${pnlColor(s.realizedPnl)}`}>
                  {formatUsd(s.realizedPnl, { showSign: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-uju-secondary">No trades yet.</p>
      <p className="text-xs text-uju-secondary/70 mt-1">
        Performance will appear here once the agent executes its first Pado swap.
      </p>
    </div>
  );
}
