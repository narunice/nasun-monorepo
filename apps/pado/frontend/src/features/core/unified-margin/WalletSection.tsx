/**
 * WalletSection
 *
 * Secondary section on the Pado Balance page showing the user's Nasun wallet
 * holdings (funds NOT yet deposited to Pado), wallet operations (Send /
 * Receive / History / Security), and a "Recover funds" action that pulls all
 * funds out of Pado back into the wallet.
 *
 * The recover action is the same on-chain operation as "Withdraw All from
 * Pado" on the hero card; surfacing it here gives users a wallet-side way to
 * reclaim escrowed funds.
 */

import { useState } from 'react';
import { SendTransaction, SecuritySettings } from '@nasun/wallet-ui';
import { useWallet, useZkLogin, useMultiBalance, usePasskeyStore } from '@nasun/wallet';
import { TokenIcon } from '@/components/common';
import { useActiveAddress } from '../../../hooks/useActiveAddress';
import { TOKENS } from '../../../config/network';
import { getUnifiedPrice, type TokenSymbol } from '../../../lib/prices';
import { TransferHistory } from '../../portfolio/components/TransferHistory';
import { PaymentQRCode } from '../../payments';
import { usePadoAccount } from './usePadoAccount';
import { useMarginAccount } from './useMarginAccount';
import { WithdrawAllConfirmModal } from './WithdrawAllConfirmModal';
import { formatErrorMessage } from '../../trading/utils/errorParser';

type WalletSubTab = 'send' | 'receive' | 'history' | 'security';

const SUB_TABS: { id: WalletSubTab; label: string }[] = [
  { id: 'send', label: 'Send' },
  { id: 'receive', label: 'Receive' },
  { id: 'history', label: 'History' },
  { id: 'security', label: 'Security' },
];

interface WalletTokenRow {
  symbol: TokenSymbol;
  name: string;
  amount: number;
  usd: number;
}

export function WalletSection() {
  const { status, account: walletAccount } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = (status === 'unlocked' && walletAccount) || isZkLoggedIn || isPasskeyUnlocked;

  const activeAddress = useActiveAddress();
  const { data: balances, isLoading: isBalanceLoading } = useMultiBalance({ address: activeAddress });

  const padoAccount = usePadoAccount();
  const { withdrawAllPado, isWithdrawing } = useMarginAccount();

  const [activeSubTab, setActiveSubTab] = useState<WalletSubTab>('send');
  const [showRecoverConfirm, setShowRecoverConfirm] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);

  if (!isConnected) {
    return null;
  }

  // Build wallet token rows. Only include tokens with non-zero balance.
  const tokens: WalletTokenRow[] = [];

  const nasunRaw = balances?.native?.balance ?? 0n;
  const nasunAmount = Number(nasunRaw) / Math.pow(10, TOKENS.NASUN.decimals);
  if (nasunAmount > 0) {
    const price = getUnifiedPrice('NSN');
    tokens.push({
      symbol: 'NSN',
      name: 'Nasun',
      amount: nasunAmount,
      usd: nasunAmount * price,
    });
  }

  const tokenSymbols: TokenSymbol[] = ['NUSDC', 'NBTC', 'NETH', 'NSOL'];
  const decimalsMap: Record<TokenSymbol, number> = {
    NSN: 9,
    NUSDC: TOKENS.NUSDC.decimals,
    NBTC: TOKENS.NBTC.decimals,
    NETH: 8,
    NSOL: 9,
  };
  const nameMap: Record<TokenSymbol, string> = {
    NSN: 'Nasun',
    NUSDC: 'Nasun USDC',
    NBTC: 'Nasun BTC',
    NETH: 'Nasun ETH',
    NSOL: 'Nasun SOL',
  };

  for (const sym of tokenSymbols) {
    const raw = balances?.tokens?.[sym]?.balance ?? 0n;
    if (raw === 0n) continue;
    const amount = Number(raw) / Math.pow(10, decimalsMap[sym]);
    const price = getUnifiedPrice(sym);
    tokens.push({
      symbol: sym,
      name: nameMap[sym],
      amount,
      usd: amount * price,
    });
  }

  const totalWalletUsd = tokens.reduce((s, t) => s + t.usd, 0);

  const hasAnyPadoBalance =
    padoAccount.breakdown.bm.quoteRaw > 0n ||
    padoAccount.breakdown.bm.baseRaw > 0n ||
    padoAccount.breakdown.ma.nusdcRaw > 0n ||
    padoAccount.breakdown.ma.nbtcRaw > 0n;

  const handleRecoverConfirm = async () => {
    setRecoverError(null);
    try {
      await withdrawAllPado();
      setShowRecoverConfirm(false);
    } catch (err) {
      setRecoverError(formatErrorMessage(err));
    }
  };

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-5 space-y-5">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-theme-text-primary">In Your Nasun Wallet</h3>
        <p className="text-xs text-theme-text-secondary mt-0.5">
          Funds in your wallet, available to deposit to Pado, send, or hold.
        </p>
      </div>

      {/* Total + token list */}
      <div>
        <div className="text-2xl font-bold text-theme-text-primary mb-3">
          ${totalWalletUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        {isBalanceLoading ? (
          <div className="space-y-2">
            <div className="h-12 bg-theme-bg-tertiary rounded-lg animate-pulse" />
            <div className="h-12 bg-theme-bg-tertiary rounded-lg animate-pulse" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-sm text-theme-text-muted py-4 text-center">
            No tokens in wallet yet.
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div
                key={t.symbol}
                className="flex items-center justify-between py-2.5 px-3 bg-theme-bg-tertiary rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TokenIcon symbol={t.symbol} size="md" gradient />
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-theme-text-primary">{t.symbol}</div>
                    <div className="text-xs text-theme-text-muted truncate">{t.name}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-theme-text-primary">
                    {t.amount.toLocaleString('en-US', {
                      maximumFractionDigits: t.symbol === 'NBTC' ? 8 : 4,
                    })}
                  </div>
                  <div className="text-xs text-theme-text-muted">
                    ${t.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub tabs */}
      <div>
        <div className="flex gap-1.5 sm:gap-2 mb-3">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex-1 py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                activeSubTab === tab.id
                  ? 'bg-pd2 text-white'
                  : 'bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-theme-bg-primary border border-theme-border rounded-lg p-4">
          {activeSubTab === 'send' && <SendTransaction />}
          {activeSubTab === 'receive' && <PaymentQRCode />}
          {activeSubTab === 'history' && <TransferHistory />}
          {activeSubTab === 'security' && <SecuritySettings />}
        </div>
      </div>

      {/* Recovery */}
      <div className="border-t border-theme-border pt-4">
        <div className="text-sm font-medium text-theme-text-secondary mb-2">
          Recovery
        </div>

        <button
          onClick={() => { setRecoverError(null); setShowRecoverConfirm(true); }}
          disabled={!hasAnyPadoBalance || isWithdrawing}
          className="w-full text-left p-3 bg-theme-bg-tertiary hover:bg-theme-bg-primary border border-theme-border hover:border-pd2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <span className="text-pd3 text-lg">⤴</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-theme-text-primary">
                Recover funds from Pado
              </div>
              <div className="text-xs text-theme-text-muted">
                {hasAnyPadoBalance
                  ? 'Withdraw all your Pado deposits back to this wallet. Same as "Withdraw All from Pado" on the hero card.'
                  : 'Nothing to recover. Your Pado balance is empty.'}
              </div>
            </div>
          </div>
        </button>

        <p className="text-xs text-theme-text-muted mt-2 leading-relaxed">
          Use this to fully reclaim your trading funds. Closes any open orders
          and returns all tokens to your wallet here.
        </p>
      </div>

      {/* Recover confirm modal (reuses Withdraw All) */}
      {showRecoverConfirm && (
        <WithdrawAllConfirmModal
          bmNusdcRaw={padoAccount.breakdown.bm.quoteRaw}
          bmNbtcRaw={padoAccount.breakdown.bm.baseRaw}
          maNusdcRaw={padoAccount.breakdown.ma.nusdcRaw}
          isLoading={isWithdrawing}
          error={recoverError}
          onConfirm={handleRecoverConfirm}
          onCancel={() => setShowRecoverConfirm(false)}
        />
      )}
    </div>
  );
}
