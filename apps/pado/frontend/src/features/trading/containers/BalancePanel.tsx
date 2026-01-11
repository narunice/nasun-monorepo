/**
 * BalancePanel Container
 * 상단 잔고 표시 (NASUN, NBTC, NUSDC, Mid Price)
 */

import { useWallet, useMultiBalance, useZkLogin } from '@nasun/wallet';
import { useOrderbook } from '../hooks';
import { TOKENS } from '../../../config/network';

export function BalancePanel() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { data: multiBalance } = useMultiBalance();
  const { data: orderbookData } = useOrderbook();

  // Transform multiBalance to pado format
  const balances = multiBalance ? {
    nasun: multiBalance.native,
    nbtc: multiBalance.tokens['NBTC'] || { symbol: 'NBTC', balance: 0n, formatted: '0', decimals: TOKENS.NBTC.decimals, type: TOKENS.NBTC.type },
    nusdc: multiBalance.tokens['NUSDC'] || { symbol: 'NUSDC', balance: 0n, formatted: '0', decimals: TOKENS.NUSDC.decimals, type: TOKENS.NUSDC.type },
  } : undefined;

  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {/* NASUN */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">NASUN</div>
        <div className="text-xl font-semibold text-theme-text-primary">{balances?.nasun.formatted || '0'}</div>
      </div>

      {/* NBTC */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">NBTC</div>
        <div className="text-xl font-semibold text-theme-text-primary">{balances?.nbtc.formatted || '0'}</div>
      </div>

      {/* NUSDC */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <div className="text-sm text-theme-text-muted">NUSDC</div>
        <div className="text-xl font-semibold text-theme-text-primary">{balances?.nusdc.formatted || '0'}</div>
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
