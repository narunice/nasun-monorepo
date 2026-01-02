/**
 * WelcomeBanner
 * Call-to-action for users who haven't connected their wallet
 */

import { WalletConnect } from '@nasun/wallet-ui';

export function WelcomeBanner() {
  return (
    <div className="relative rounded-xl p-6">
      {/* Background gradient - Light: bright & soft, Dark: deep & muted */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-pado-4 to-pado-5 opacity-40 dark:from-pado-1 dark:to-pado-2 dark:opacity-10" />

      {/* Subtle accent overlay for depth */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-transparent via-transparent to-pado-1/10 dark:to-pado-3/10" />

      {/* Content - Light: dark text, Dark: white text */}
      <div className="relative z-10">
        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
          Welcome to <span className="font-brand tracking-wider">PADO</span>
        </h2>
        <p className="text-gray-700 dark:text-white/80 mb-4 text-sm">
          The Decentralized Everything Exchange. Connect your wallet to start trading, earning, and predicting.
        </p>
        {/* z-50 to ensure dropdown appears above banner */}
        <div className="inline-block relative z-50">
          <WalletConnect dropdownAlign="left" />
        </div>
      </div>
    </div>
  );
}
