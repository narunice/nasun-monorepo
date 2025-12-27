import { useEffect, useState } from 'react';
import { useMarket } from '../context/MarketContext';

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

// 시뮬레이션 거래 데이터 (실제로는 블록체인 이벤트에서 가져옴)
function generateMockTrades(basePrice: number, count: number): Trade[] {
  const trades: Trade[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const volatility = 0.005;
    const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;
    const price = basePrice + priceChange;
    const quantity = 0.001 + Math.random() * 0.1; // 0.001 ~ 0.101 BTC

    trades.push({
      id: `trade-${now}-${i}`,
      price,
      quantity,
      isBuy: Math.random() > 0.5,
      timestamp: now - i * (1000 + Math.random() * 5000), // 최근 거래일수록 먼저
    });
  }

  return trades;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function TradeHistory({ trades: externalTrades, className = '' }: TradeHistoryProps) {
  const { currentPool } = useMarket();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  useEffect(() => {
    // 외부에서 trades를 받으면 사용, 아니면 시뮬레이션 데이터
    if (externalTrades && externalTrades.length > 0) {
      setTrades(externalTrades);
      setIsLoading(false);
    } else {
      // 시뮬레이션: 초기 데이터 로드
      const mockTrades = generateMockTrades(95000, 20);
      setTrades(mockTrades);
      setIsLoading(false);

      // 시뮬레이션: 새 거래 추가
      const interval = setInterval(() => {
        const newTrade = generateMockTrades(95000, 1)[0];
        newTrade.timestamp = Date.now();
        newTrade.id = `trade-${Date.now()}`;

        setTrades((prev) => [newTrade, ...prev.slice(0, 19)]);
      }, 2000 + Math.random() * 3000);

      return () => clearInterval(interval);
    }
  }, [externalTrades]);

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      <div className="p-3 border-b border-gray-700">
        <h3 className="font-semibold text-sm">Recent Trades</h3>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
        ) : trades.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No trades yet</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-gray-400 sticky top-0 bg-gray-800">
              <tr>
                <th className="py-2 px-3 text-left font-medium">Price ({quoteSymbol})</th>
                <th className="py-2 px-3 text-right font-medium">Amount ({baseSymbol})</th>
                <th className="py-2 px-3 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="hover:bg-gray-700/30 transition-colors"
                >
                  <td className={`py-1.5 px-3 font-mono ${trade.isBuy ? 'text-green-400' : 'text-red-400'}`}>
                    ${trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-gray-300">
                    {trade.quantity.toFixed(4)}
                  </td>
                  <td className="py-1.5 px-3 text-right text-gray-500">
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
