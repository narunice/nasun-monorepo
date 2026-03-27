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
        <div className="flex items-center justify-center gap-2 mb-2">
          <h2 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
            Welcome to <span className="font-brand tracking-wider">PADO</span>
          </h2>
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-pd2/20 text-pd3 rounded-full uppercase tracking-wide">
            Public Test
          </span>
        </div>
        <p className="text-theme-text-secondary mb-1 text-base font-medium">
          Thanks for being here early.
        </p>
        <p className="text-theme-text-muted mb-4 text-sm max-w-lg mx-auto">
          You're one of the first to explore Pado, a unified financial app on Nasun Network. Right now, the Weekly Lottery is live. Grab some free test tokens, pick your lucky numbers, and let's see how it goes. More features are on the way.
        </p>
        {/* z-50 to ensure dropdown appears above banner */}
        <div className="inline-block relative z-50">
          <WalletConnect dropdownAlign="center" />
        </div>
      </div>
    </div>
  );
}
