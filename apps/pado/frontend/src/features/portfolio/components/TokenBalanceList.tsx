/**
 * TokenBalanceList Component
 * Display individual token balances with USD values
 */

import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useTotalValue, type TokenValue } from '../hooks';
import { SkeletonMarketRow, TokenIcon } from '@/components/common';

interface TokenRowProps {
  token: TokenValue;
}

function TokenRow({ token }: TokenRowProps) {
  const isPredictions = token.symbol === 'Predictions';

  // Format balance based on token - simplified for readability
  const formatBalance = (symbol: string, balance: string) => {
    if (symbol === 'Predictions') return balance; // "X positions"
    const num = parseFloat(balance);
    if (symbol === 'NBTC') {
      // Show 4 decimals for small amounts, 2 for larger
      return num < 0.01 ? num.toFixed(4) : num.toFixed(2);
    } else if (symbol === 'NUSDC') {
      return num.toFixed(2);
    }
    return num.toFixed(2);
  };

  const isPositive = token.change24h >= 0;
  const changeColor = token.change24h === 0 ? 'text-theme-text-secondary' : isPositive ? 'text-green-400' : 'text-red-400';

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        {isPredictions ? (
          <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-sm">📊</div>
        ) : (
          <TokenIcon symbol={token.symbol} size="md" />
        )}
        <div>
          <div className="font-medium">{token.symbol}</div>
          {!isPredictions && (
            <div className="text-sm xl:text-base text-theme-text-secondary">
              ${token.price.toLocaleString('en-US')} each
            </div>
          )}
          {isPredictions && (
            <div className="text-sm xl:text-base text-theme-text-secondary">
              Cost basis
            </div>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className={isPredictions ? '' : 'font-mono'}>
          {isPredictions ? token.balance : `${formatBalance(token.symbol, token.balance)} ${token.symbol}`}
        </div>
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm xl:text-base text-theme-text-secondary">
            ${token.value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {token.change24h !== 0 && (
            <span className={`text-xs xl:text-sm ${changeColor}`}>
              {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TokenBalanceList() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { tokens, isLoading } = useTotalValue();

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = status === 'unlocked' || isZkConnected || isPasskeyUnlocked;

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border">
          <h2 className="font-semibold">Assets</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          {status === 'locked' ? 'Unlock wallet to view your assets' : 'Connect wallet to view your assets'}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border">
          <h2 className="font-semibold">Assets</h2>
        </div>
        <div className="px-4 divide-y divide-theme-border">
          <SkeletonMarketRow />
          <SkeletonMarketRow />
          <SkeletonMarketRow />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg">
      <div className="px-4 py-3 border-b border-theme-border">
        <h2 className="font-semibold">Assets</h2>
      </div>
      <div className="divide-y divide-theme-border">
        {tokens.map((token) => (
          <TokenRow key={token.symbol} token={token} />
        ))}
      </div>
    </div>
  );
}
