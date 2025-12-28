/**
 * PaymentPage
 * Token transfer page using @nasun/wallet-ui SendTransaction component
 */

import { SendTransaction } from '@nasun/wallet-ui';
import { useWallet } from '@nasun/wallet';

export function PaymentPage() {
  const { status } = useWallet();
  const isConnected = status === 'unlocked';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Send</h1>

      {!isConnected ? (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">Connect wallet to send tokens</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-6">
          <SendTransaction />
        </div>
      )}
    </div>
  );
}
