/**
 * AssetOverview Component
 * Display total portfolio value in USD
 */

import { useWallet } from '@nasun/wallet';
import { useTotalValue } from '../hooks';

export function AssetOverview() {
  const { status } = useWallet();
  const { totalValue, isLoading } = useTotalValue();

  const isConnected = status === 'unlocked';

  if (!isConnected) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-sm text-gray-400">Total Asset Value</div>
        <div className="text-3xl font-bold mt-2 text-gray-500">--</div>
        <div className="text-sm text-gray-500 mt-2">
          Connect wallet to view your portfolio
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="text-sm text-gray-400">Total Asset Value</div>
      <div className="text-3xl font-bold mt-2">
        {isLoading ? (
          <span className="text-gray-500">Loading...</span>
        ) : (
          `$${totalValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        )}
      </div>
    </div>
  );
}
