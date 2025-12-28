/**
 * BalancePanel Container
 * 상단 잔고 표시 (NASUN, NBTC, NUSDC, Mid Price)
 */

import { useWallet, useMultiBalance } from '@nasun/wallet';
import { useOrderbook, useFaucet } from '../hooks';
import { TOKENS } from '../../../config/network';

export function BalancePanel() {
  const { status, account } = useWallet();
  const { data: multiBalance } = useMultiBalance();
  const { data: orderbookData } = useOrderbook();

  // Transform multiBalance to pado format
  const balances = multiBalance ? {
    nasun: multiBalance.native,
    nbtc: multiBalance.tokens['NBTC'] || { symbol: 'NBTC', balance: 0n, formatted: '0', decimals: TOKENS.NBTC.decimals, type: TOKENS.NBTC.type },
    nusdc: multiBalance.tokens['NUSDC'] || { symbol: 'NUSDC', balance: 0n, formatted: '0', decimals: TOKENS.NUSDC.decimals, type: TOKENS.NUSDC.type },
  } : undefined;
  const { isNasunLoading, isNbtcLoading, isNusdcLoading, handleNasunFaucet, handleNbtcFaucet, handleNusdcFaucet } = useFaucet();

  const isConnected = status === 'unlocked' && account;
  const midPrice = orderbookData?.midPrice ?? 0;

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-theme-text-muted">Pool Mid Price</div>
          <div className="text-xl font-semibold text-green-400">
            ${midPrice > 0 ? midPrice.toFixed(2) : '--'}
          </div>
        </div>
        <div className="text-sm text-theme-text-muted">
          Connect wallet to view balances and trade
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* NASUN */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">NASUN</div>
        <div className="text-xl font-semibold text-theme-text-primary">{balances?.nasun.formatted || '0'}</div>
        <button
          onClick={handleNasunFaucet}
          disabled={isNasunLoading}
          className="mt-2 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white"
        >
          {isNasunLoading ? 'Requesting...' : 'Get from Faucet'}
        </button>
      </div>

      {/* NBTC */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">NBTC</div>
        <div className="text-xl font-semibold text-theme-text-primary">{balances?.nbtc.formatted || '0'}</div>
        <button
          onClick={handleNbtcFaucet}
          disabled={isNbtcLoading}
          className="mt-2 text-xs px-2 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded text-white"
        >
          {isNbtcLoading ? 'Requesting...' : 'Get from Faucet'}
        </button>
      </div>

      {/* NUSDC */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">NUSDC</div>
        <div className="text-xl font-semibold text-theme-text-primary">{balances?.nusdc.formatted || '0'}</div>
        <button
          onClick={handleNusdcFaucet}
          disabled={isNusdcLoading}
          className="mt-2 text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
        >
          {isNusdcLoading ? 'Requesting...' : 'Get from Faucet'}
        </button>
      </div>

      {/* Mid Price */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">Pool Mid Price</div>
        <div className="text-xl font-semibold text-green-400">
          ${midPrice > 0 ? midPrice.toFixed(2) : '--'}
        </div>
      </div>
    </div>
  );
}
