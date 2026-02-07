import type { TraderFill } from '../types';

interface TraderFillsTableProps {
  fills: TraderFill[];
  isLoading: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function shortenPoolId(poolId: string): string {
  if (poolId.length <= 12) return poolId;
  return `${poolId.slice(0, 6)}...${poolId.slice(-4)}`;
}

export function TraderFillsTable({ fills, isLoading }: TraderFillsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-4">
            <div className="h-4 bg-theme-bg-tertiary rounded w-24" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-16" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-12" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-20" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (fills.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-theme-text-muted">
        No trade history found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-theme-border">
            <th className="text-left py-2.5 px-3 text-xs font-medium text-theme-text-muted">Time</th>
            <th className="text-left py-2.5 px-3 text-xs font-medium text-theme-text-muted">Pool</th>
            <th className="text-center py-2.5 px-3 text-xs font-medium text-theme-text-muted">Side</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-theme-text-muted">Price</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-theme-text-muted">Total</th>
          </tr>
        </thead>
        <tbody>
          {fills.map((fill, i) => (
            <tr key={`${fill.txDigest}-${i}`} className="border-b border-theme-border/50 hover:bg-theme-bg-tertiary/30 transition-colors">
              <td className="py-2 px-3 text-xs text-theme-text-secondary whitespace-nowrap">
                {formatTime(fill.timestamp)}
              </td>
              <td className="py-2 px-3 text-xs text-theme-text-muted font-mono">
                {shortenPoolId(fill.poolId)}
              </td>
              <td className="py-2 px-3 text-center">
                <span className={`text-xs font-medium ${
                  fill.side === 'buy' ? 'text-green-500' : 'text-red-500'
                }`}>
                  {fill.side === 'buy' ? 'Buy' : 'Sell'}
                </span>
              </td>
              <td className="py-2 px-3 text-right text-xs font-mono text-theme-text-primary">
                ${fill.price}
              </td>
              <td className="py-2 px-3 text-right text-xs font-mono text-theme-text-primary">
                ${fill.quoteQuantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
