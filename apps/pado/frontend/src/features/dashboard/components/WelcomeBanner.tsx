/**
 * WelcomeBanner
 * Call-to-action for users who haven't connected their wallet
 */

import { WalletConnect } from '@nasun/wallet-ui';

export function WelcomeBanner() {
  return (
    <div className="relative rounded-xl p-6">
      {/* Background gradient - Light: bright & soft, Dark: deep & muted */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-pd4 to-pd5 opacity-40 dark:from-pd1 dark:to-pd2 dark:opacity-10" />

      {/* Subtle accent overlay for depth */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-transparent via-transparent to-pd1/10 dark:to-pd3/10" />

      {/* Content - Light: dark text, Dark: white text */}
      <div className="relative z-10 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-theme-text-primary">
          Welcome to <span className="font-brand tracking-wider">PADO</span>
        </h2>
        <p className="text-theme-text-secondary mb-1 text-base font-medium">
          Trade. Socialize. On-Chain.
        </p>
        <p className="text-theme-text-muted mb-4 text-sm">
          Get free tokens from the faucet, place your first order on a real orderbook, and explore what's possible — all on Nasun, our own L1 blockchain.
        </p>
        {/* z-50 to ensure dropdown appears above banner */}
        <div className="inline-block relative z-50">
          <WalletConnect dropdownAlign="center" />
        </div>
      </div>
    </div>
  );
}
