import type { BalanceManagerBalance } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

interface BalanceManagerCardProps {
  balanceManagerId: string | null;
  balance: BalanceManagerBalance;
  isLoading: boolean;
  onCreate: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
}

export function BalanceManagerCard({
  balanceManagerId,
  balance,
  isLoading,
  onCreate,
  onDeposit,
  onWithdraw,
}: BalanceManagerCardProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  // Format balance based on token decimals
  const baseDecimals = currentPool.baseToken.decimals > 6 ? 4 : 2;
  const quoteDecimals = currentPool.quoteToken.decimals > 4 ? 2 : currentPool.quoteToken.decimals;

  if (!balanceManagerId) {
    return (
      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded">
        <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
          Trading balance required. Enable trading to place orders.
        </p>
        <button
          onClick={onCreate}
          disabled={isLoading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm text-white"
        >
          {isLoading ? 'Enabling...' : 'Enable Trading'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded">
      <p className="text-xs text-green-700 dark:text-green-400 font-mono truncate mb-1">
        BM: {balanceManagerId.slice(0, 16)}...
      </p>
      <div className="flex justify-between text-xs mb-2 py-1 px-2 bg-theme-bg-secondary/50 rounded">
        <span className="text-theme-text-secondary">BM Balance:</span>
        <span className="text-theme-text-primary">
          {balance.base.toFixed(baseDecimals)} {baseSymbol} / {balance.quote.toFixed(quoteDecimals)} {quoteSymbol}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDeposit}
          disabled={isLoading}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm text-white"
        >
          {isLoading ? '...' : 'Add to Trading'}
        </button>
        <button
          onClick={onWithdraw}
          disabled={isLoading}
          className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded font-medium text-sm text-white"
        >
          {isLoading ? '...' : 'Return to Wallet'}
        </button>
      </div>
      <p className="text-xs text-theme-text-secondary mt-1 text-center">
        Add funds to trade, return to wallet when done
      </p>
    </div>
  );
}
