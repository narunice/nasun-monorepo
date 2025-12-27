/**
 * BalancePanel Container
 * 상단 잔고 표시 (NASUN, NBTC, NUSDC, Mid Price)
 */

import { useWallet } from '@nasun/wallet';
import { useBalance } from '../../../hooks/useBalance';
import { useOrderbook, useFaucet } from '../hooks';

export function BalancePanel() {
  const { status, account } = useWallet();
  const { data: balances } = useBalance();
  const { data: orderbookData } = useOrderbook();
  const { isNasunLoading, isTokenLoading, handleNasunFaucet, handleTokenFaucet } = useFaucet();

  const isConnected = status === 'unlocked' && account;
  const midPrice = orderbookData?.midPrice ?? 0;

  if (!isConnected) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">Pool Mid Price</div>
          <div className="text-xl font-semibold text-green-400">
            ${midPrice > 0 ? midPrice.toFixed(2) : '--'}
          </div>
        </div>
        <div className="text-sm text-gray-400">
          Connect wallet to view balances and trade
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* NASUN */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400">NASUN</div>
        <div className="text-xl font-semibold">{balances?.nasun.formatted || '0'}</div>
        <button
          onClick={handleNasunFaucet}
          disabled={isNasunLoading}
          className="mt-2 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
        >
          {isNasunLoading ? 'Requesting...' : 'Get from Faucet'}
        </button>
      </div>

      {/* NBTC */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400">NBTC</div>
        <div className="text-xl font-semibold">{balances?.nbtc.formatted || '0'}</div>
      </div>

      {/* NUSDC */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400">NUSDC</div>
        <div className="text-xl font-semibold">{balances?.nusdc.formatted || '0'}</div>
        <button
          onClick={handleTokenFaucet}
          disabled={isTokenLoading}
          className="mt-2 text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded"
        >
          {isTokenLoading ? 'Getting...' : 'Get NBTC + NUSDC'}
        </button>
      </div>

      {/* Mid Price */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400">Pool Mid Price</div>
        <div className="text-xl font-semibold text-green-400">
          ${midPrice > 0 ? midPrice.toFixed(2) : '--'}
        </div>
      </div>
    </div>
  );
}
