/**
 * WelcomeBanner
 * Call-to-action for users who haven't connected their wallet
 */

import { WalletConnect } from '@nasun/wallet-ui';

export function WelcomeBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl p-6 text-white">
      {/* Background gradient with brightness control */}
      <div className="absolute inset-0 bg-gradient-to-r from-pado-1 to-pado-2 brightness-90 dark:from-pado-1 dark:to-pado-2 dark:brightness-100" />

      {/* Subtle accent overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-pado-3/20 dark:to-pado-3/10" />

      {/* Content */}
      <div className="relative z-10">
        <h2 className="text-xl font-bold mb-2">
          Welcome to <span className="font-brand tracking-wider">PADO</span>
        </h2>
        <p className="text-white/80 mb-4 text-sm">
          The Decentralized Everything Exchange. Connect your wallet to start trading, earning, and predicting.
        </p>
        <div className="inline-block">
          <WalletConnect dropdownAlign="left" />
        </div>
      </div>
    </div>
  );
}
