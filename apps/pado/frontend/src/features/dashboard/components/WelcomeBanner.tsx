/**
 * WelcomeBanner
 * Call-to-action for users who haven't connected their wallet
 */

import { WalletConnect } from '@nasun/wallet-ui';

export function WelcomeBanner() {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-xl p-6 text-white">
      <h2 className="text-xl font-bold mb-2">Welcome to Pado</h2>
      <p className="text-blue-100 mb-4 text-sm">
        The Decentralized Everything Exchange. Connect your wallet to start trading, earning, and predicting.
      </p>
      <div className="inline-block">
        <WalletConnect dropdownAlign="left" />
      </div>
    </div>
  );
}
