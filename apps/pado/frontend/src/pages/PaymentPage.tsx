/**
 * PaymentPage
 * Token transfer page with Send/Receive tabs
 * Send: Uses @nasun/wallet-ui SendTransaction component
 * Receive: Shows QR code for receiving payments
 */

import { useState } from 'react';
import { SendTransaction } from '@nasun/wallet-ui';
import { useWallet } from '@nasun/wallet';
import { useLocation } from 'react-router-dom';
import { PaymentQRCode } from '../features/payments';

type Tab = 'send' | 'receive';

export function PaymentPage() {
  const { status } = useWallet();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('send');
  const isConnected = status === 'unlocked';

  // Use location state key to remount SendTransaction when nav clicked again
  const stateKey = (location.state as { key?: number } | null)?.key || 'default';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-theme-text-primary">Payments</h1>

      {/* Tab Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'send'
              ? 'bg-theme-accent text-white'
              : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
          }`}
        >
          Send
        </button>
        <button
          onClick={() => setActiveTab('receive')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'receive'
              ? 'bg-theme-accent text-white'
              : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
          }`}
        >
          Receive
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'send' ? (
        !isConnected ? (
          <div className="bg-theme-bg-secondary rounded-lg p-6 text-center">
            <p className="text-theme-text-muted">Connect wallet to send tokens</p>
          </div>
        ) : (
          <div className="bg-theme-bg-secondary rounded-lg p-6">
            <SendTransaction key={stateKey} />
          </div>
        )
      ) : (
        <PaymentQRCode />
      )}
    </div>
  );
}
