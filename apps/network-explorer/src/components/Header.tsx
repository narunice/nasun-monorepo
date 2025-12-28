import { Link } from 'react-router-dom';
import { networkConfig } from '../lib/sui-client';
import { useWalletStatus } from '@nasun/wallet';
import { WalletConnect, BalanceDisplay, FaucetButton } from '@nasun/wallet-ui';

interface HeaderProps {
  showNetworkName?: boolean;
}

export default function Header({ showNetworkName = false }: HeaderProps) {
  const walletStatus = useWalletStatus();

  return (
    <header className="bg-slate-800 border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-2xl font-bold text-nasun-white">
              <img src="/nasun_symbol_white.svg" alt="Nasun" className="h-8 w-8" />
              Nasun Explorer
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              <Link to="/transactions" className="text-sm text-slate-400 hover:text-white transition-colors">
                Transactions
              </Link>
              <Link to="/validators" className="text-sm text-slate-400 hover:text-white transition-colors">
                Validators
              </Link>
              <Link to="/checkpoints" className="text-sm text-slate-400 hover:text-white transition-colors">
                Checkpoints
              </Link>
              <Link to="/package/0x2" className="text-sm text-slate-400 hover:text-white transition-colors">
                Packages
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {showNetworkName && (
              <div className="text-sm text-slate-400">
                {networkConfig.name}
              </div>
            )}

            {walletStatus === 'unlocked' && (
              <>
                <BalanceDisplay compact />
                <FaucetButton variant="compact" />
              </>
            )}

            <WalletConnect />
          </div>
        </div>
      </div>
    </header>
  );
}
