/**
 * DashboardHeader - Top header bar for the dashboard
 */

import { WalletConnect, MultiBalanceDisplay } from '@nasun/wallet-ui';
import { ThemeToggle } from '../theme/ThemeToggle';
import { NETWORK_CONFIG } from '../../config/network';

interface DashboardHeaderProps {
  onMenuToggle: () => void;
}

export function DashboardHeader({ onMenuToggle }: DashboardHeaderProps) {
  return (
    <header className="border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
      {/* Left: hamburger (mobile) */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      {/* Center: token balances + faucet (desktop) */}
      <div className="hidden md:block">
        <MultiBalanceDisplay tokens={['NUSDC']} showNative showFaucet compact />
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <span className="text-xs text-[var(--color-text-muted)] px-2 py-1 rounded bg-[var(--color-bg-secondary)]">
          {NETWORK_CONFIG.networkName}
        </span>
        <WalletConnect />
      </div>
    </header>
  );
}
