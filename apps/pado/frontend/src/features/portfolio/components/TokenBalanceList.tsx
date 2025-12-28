/**
 * TokenBalanceList Component
 * Display individual token balances with USD values
 */

import { useWallet } from '@nasun/wallet';
import { useTotalValue, type TokenValue } from '../hooks';

interface TokenRowProps {
  token: TokenValue;
}

function TokenRow({ token }: TokenRowProps) {
  // Format balance based on token
  const formatBalance = (symbol: string, balance: string) => {
    const num = parseFloat(balance);
    if (symbol === 'NBTC') {
      return num.toFixed(6);
    } else if (symbol === 'NUSDC') {
      return num.toFixed(2);
    }
    return num.toFixed(2);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">
          {token.symbol.charAt(0)}
        </div>
        <div>
          <div className="font-medium">{token.symbol}</div>
          <div className="text-sm text-gray-400">
            @${token.price.toLocaleString('en-US')}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono">
          {formatBalance(token.symbol, token.balance)} {token.symbol}
        </div>
        <div className="text-sm text-gray-400">
          ${token.value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>
    </div>
  );
}

export function TokenBalanceList() {
  const { status } = useWallet();
  const { tokens, isLoading } = useTotalValue();

  const isConnected = status === 'unlocked';

  if (!isConnected) {
    return (
      <div className="bg-gray-800 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="font-semibold">Assets</h2>
        </div>
        <div className="p-8 text-center text-gray-500">
          Connect wallet to view your assets
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="font-semibold">Assets</h2>
        </div>
        <div className="p-8 text-center text-gray-500">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="font-semibold">Assets</h2>
      </div>
      <div className="divide-y divide-gray-700">
        {tokens.map((token) => (
          <TokenRow key={token.symbol} token={token} />
        ))}
      </div>
    </div>
  );
}
