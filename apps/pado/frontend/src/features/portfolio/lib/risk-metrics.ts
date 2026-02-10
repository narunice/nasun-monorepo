/**
 * Risk Metrics Library
 * Pure functions for computing advanced portfolio risk indicators.
 * Used by TradeStats to display Sharpe Ratio, Profit Factor, Expectancy, etc.
 */

export interface RiskMetrics {
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  largestWin: number;
  largestLoss: number;
}

const EMPTY_METRICS: RiskMetrics = {
  sharpeRatio: 0,
  profitFactor: 0,
  avgWin: 0,
  avgLoss: 0,
  expectancy: 0,
  largestWin: 0,
  largestLoss: 0,
};

interface TradePnl {
  pnl: number;
  timestamp: number;
}

/**
 * Compute advanced risk metrics from per-trade PnL values.
 *
 * @param trades - Array of {pnl, timestamp} for each trade
 * @returns RiskMetrics with Sharpe, Profit Factor, Avg Win/Loss, Expectancy
 */
export function computeRiskMetrics(trades: TradePnl[]): RiskMetrics {
  if (trades.length === 0) return EMPTY_METRICS;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);

  // Profit Factor: gross profit / |gross loss|
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? Math.min(grossProfit / grossLoss, 99.9) : (grossProfit > 0 ? 99.9 : 0);

  // Avg Win / Avg Loss
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

  // Win rate and Expectancy: (winRate * avgWin) - (lossRate * avgLoss)
  const total = wins.length + losses.length;
  const winRate = total > 0 ? wins.length / total : 0;
  const lossRate = total > 0 ? losses.length / total : 0;
  const expectancy = (winRate * avgWin) - (lossRate * avgLoss);

  // Largest win / loss (use reduce to avoid stack overflow on large arrays)
  const largestWin = wins.length > 0 ? wins.reduce((max, t) => t.pnl > max ? t.pnl : max, -Infinity) : 0;
  const largestLoss = losses.length > 0 ? losses.reduce((min, t) => t.pnl < min ? t.pnl : min, Infinity) : 0;

  // Sharpe Ratio: annualized from daily PnL
  const sharpeRatio = computeSharpeRatio(trades);

  return {
    sharpeRatio: roundTo(sharpeRatio, 2),
    profitFactor: roundTo(profitFactor, 2),
    avgWin: roundTo(avgWin, 2),
    avgLoss: roundTo(avgLoss, 2),
    expectancy: roundTo(expectancy, 2),
    largestWin: roundTo(largestWin, 2),
    largestLoss: roundTo(largestLoss, 2),
  };
}

/**
 * Compute annualized Sharpe Ratio from trade PnL.
 * Groups trades into daily buckets, computes mean/stddev of daily returns,
 * then annualizes with sqrt(252).
 */
function computeSharpeRatio(trades: TradePnl[]): number {
  if (trades.length < 2) return 0;

  // Group PnL by day (UTC)
  const dailyPnl = new Map<string, number>();
  for (const trade of trades) {
    const day = new Date(trade.timestamp).toISOString().slice(0, 10);
    dailyPnl.set(day, (dailyPnl.get(day) ?? 0) + trade.pnl);
  }

  const dailyReturns = Array.from(dailyPnl.values());
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return 0;

  // Annualize: (mean / stddev) * sqrt(252), risk-free rate = 0
  const annualized = (mean / stddev) * Math.sqrt(252);
  return isFinite(annualized) ? annualized : 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const result = Math.round(value * factor) / factor;
  return isFinite(result) ? result : 0;
}
