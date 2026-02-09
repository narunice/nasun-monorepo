/**
 * MobileTokenPills
 * Horizontal scrolling token balance pills for mobile.
 * Each pill: [icon SYMBOL balance]
 * Benchmarked from Coinbase App portfolio strip.
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTotalValue, type TokenValue } from '../../portfolio/hooks';

const TOKEN_COLORS: Record<string, string> = {
  NBTC: 'bg-orange-500',
  NUSDC: 'bg-pd2',
  NASUN: 'bg-purple-500',
  NETH: 'bg-blue-400',
  NSOL: 'bg-green-400',
};

function formatCompactBalance(token: TokenValue): string {
  const num = parseFloat(token.balance.replace(/,/g, ''));
  if (token.symbol === 'Predictions') return token.balance;
  if (num >= 10000) return `${(num / 1000).toFixed(1)}K`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  if (num >= 1) return num.toFixed(2);
  if (num >= 0.01) return num.toFixed(4);
  return num.toFixed(6);
}

export function MobileTokenPills() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { tokens, isLoading } = useTotalValue();

  const isConnected = status === 'unlocked' || isZkConnected;

  if (!isConnected || isLoading || tokens.length === 0) return null;

  // Filter out non-token entries (Predictions, Pado Balance)
  const tokenPills = tokens.filter(t =>
    t.symbol !== 'Predictions' && t.symbol !== 'Pado Balance'
  );

  if (tokenPills.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
      {tokenPills.map((token) => (
        <div
          key={token.symbol}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-theme-bg-secondary rounded-full whitespace-nowrap shrink-0"
        >
          <div className={`w-4 h-4 rounded-full ${TOKEN_COLORS[token.symbol] ?? 'bg-theme-bg-tertiary'} flex items-center justify-center`}>
            <span className="text-[8px] font-bold text-white">{token.symbol.charAt(0)}</span>
          </div>
          <span className="text-xs font-medium text-theme-text-primary">{token.symbol}</span>
          <span className="text-xs text-theme-text-muted font-mono">{formatCompactBalance(token)}</span>
        </div>
      ))}
    </div>
  );
}
