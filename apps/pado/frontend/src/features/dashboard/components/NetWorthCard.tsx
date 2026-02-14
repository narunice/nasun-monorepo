/**
 * NetWorthCard
 * Displays total portfolio value with 24h change
 */

import { useNetWorth } from "../hooks/useNetWorth";

export function NetWorthCard() {
  const { totalUsdValue, change24h, changePercent, tokens, predictionValue, isLoading } =
    useNetWorth();

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-pd1 to-pd1/80 dark:from-pd1/80 dark:to-pd0 rounded-xl p-6 animate-pulse">
        <div className="h-4 w-20 bg-pd2/30 rounded mb-4" />
        <div className="h-8 w-36 bg-pd2/20 rounded mb-2" />
        <div className="h-4 w-28 bg-pd2/20 rounded mb-4" />
        <div className="pt-4 border-t border-pd2/30 space-y-2">
          <div className="h-4 bg-pd2/15 rounded w-full" />
          <div className="h-4 bg-pd2/15 rounded w-full" />
          <div className="h-4 bg-pd2/15 rounded w-full" />
        </div>
      </div>
    );
  }

  const isPositive = change24h >= 0;

  const formatUsd = (value: number) => {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatChange = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div className="bg-gradient-to-br from-pd1 to-pd1/80 dark:from-pd1/80 dark:to-pd0 rounded-xl p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-pd5">Net Worth</h2>
        <span className="text-xs bg-pd2/30 px-2 py-0.5 rounded-full">Devnet</span>
      </div>

      {/* Total Value */}
      <div className="mb-4">
        <div className="text-3xl font-bold mb-1">{formatUsd(totalUsdValue)}</div>
        <div
          className={`flex items-center gap-2 text-sm ${isPositive ? "text-green-300" : "text-red-300"}`}
        >
          <span>{formatChange(change24h)}</span>
          <span>({formatPercent(changePercent)})</span>
          <span className="text-pd4">24h</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-2 pt-4 border-t border-pd2/30">
        {tokens.map((token) => (
          <div key={token.symbol} className="flex items-center justify-between text-sm">
            <span className="text-pd5">{token.symbol}</span>
            <div className="flex items-center gap-2">
              <span>{formatUsd(token.usdValue)}</span>
              <span className={token.change24h >= 0 ? "text-green-300" : "text-red-300"}>
                {formatPercent(token.change24h)}
              </span>
            </div>
          </div>
        ))}
        {predictionValue > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-pd5">Predictions</span>
            <span>{formatUsd(predictionValue)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
