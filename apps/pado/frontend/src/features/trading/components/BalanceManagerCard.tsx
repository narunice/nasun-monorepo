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
      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded">
        <p className="text-sm text-blue-400 mb-2">
          BalanceManager required. Create one to place orders.
        </p>
        <button
          onClick={onCreate}
          disabled={isLoading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm"
        >
          {isLoading ? 'Creating...' : 'Create BalanceManager'}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded">
      <p className="text-xs text-green-400 font-mono truncate mb-1">
        BM: {balanceManagerId.slice(0, 16)}...
      </p>
      <div className="flex justify-between text-xs mb-2 py-1 px-2 bg-gray-800/50 rounded">
        <span className="text-gray-400">BM Balance:</span>
        <span className="text-white">
          {balance.base.toFixed(baseDecimals)} {baseSymbol} / {balance.quote.toFixed(quoteDecimals)} {quoteSymbol}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDeposit}
          disabled={isLoading}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm"
        >
          {isLoading ? '...' : 'Deposit'}
        </button>
        <button
          onClick={onWithdraw}
          disabled={isLoading}
          className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded font-medium text-sm"
        >
          {isLoading ? '...' : 'Withdraw'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1 text-center">
        Deposit to trade, Withdraw to wallet
      </p>
    </div>
  );
}
