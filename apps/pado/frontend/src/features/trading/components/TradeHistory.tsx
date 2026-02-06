import { useMarket } from "../context/MarketContext";
import { useTradeEvents } from "../hooks/useTradeEvents";
import { ConnectionStatusBadge } from "@/components/common/ConnectionStatus";

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  isBuy: boolean;
  timestamp: number;
}

interface TradeHistoryProps {
  trades?: Trade[];
  className?: string;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function TradeHistory({ trades: externalTrades, className = "" }: TradeHistoryProps) {
  const { currentPool } = useMarket();
  const { trades: eventTrades, connectionMode } = useTradeEvents();

  // Use external trades if provided, otherwise use event trades
  const trades = externalTrades && externalTrades.length > 0 ? externalTrades : eventTrades;
  const displayedTrades = trades.slice(0, 12);

  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <ConnectionStatusBadge mode={connectionMode} />
      </div>

      <div>
        {trades.length === 0 ? (
          <div className="p-4 text-center text-theme-text-muted text-sm xl:text-base">No trades yet</div>
        ) : (
          <table className="w-full text-xs xl:text-sm">
            <thead className="text-theme-text-secondary">
              <tr>
                <th className="py-2 px-3 text-left font-medium">Price ({quoteSymbol})</th>
                <th className="py-2 px-3 text-right font-medium">Amount ({baseSymbol})</th>
                <th className="py-2 px-3 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {displayedTrades.map((trade) => (
                <tr key={trade.id} className="hover:bg-theme-bg-tertiary/30 transition-colors">
                  <td
                    className={`py-1.5 px-3 font-mono ${trade.isBuy ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    $
                    {trade.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-theme-text-primary">
                    {trade.quantity.toFixed(4)}
                  </td>
                  <td className="py-1.5 px-3 text-right text-theme-text-muted">
                    {formatTime(trade.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
