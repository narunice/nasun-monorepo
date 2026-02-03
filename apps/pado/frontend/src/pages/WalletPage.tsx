/**
 * WalletPage
 * Unified wallet page with Send/Receive/History/Settings tabs
 *
 * Phase 16.1: Added UnifiedBalanceCard for total balance overview
 *
 * @version 2.0.0
 */

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SendTransaction, SecuritySettings } from '@nasun/wallet-ui';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { PaymentQRCode } from '../features/payments';
import { TransferHistory } from '../features/portfolio/components/TransferHistory';
import { UnifiedBalanceCard, MarginAccountCard } from '../features/core/unified-margin';

type TabType = 'send' | 'receive' | 'history' | 'settings';

export function WalletPage() {
  const location = useLocation();
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();

  // Allow initial tab from navigation state
  const initialTab = (location.state as { tab?: TabType })?.tab || 'send';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Check if connected via traditional wallet OR zkLogin
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  // Remount key from navigation
  const remountKey = (location.state as { key?: number })?.key || 0;

  const tabs: { id: TabType; label: string }[] = [
    { id: 'send', label: 'Send' },
    { id: 'receive', label: 'Receive' },
    { id: 'history', label: 'History' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-theme-text-primary">Wallet</h1>
        <p className="text-sm text-theme-text-secondary mt-1">
          Manage your assets across wallet, trading, and Pado Balance
        </p>
      </div>

      {/* Unified Balance Overview */}
      <div className="mb-6">
        <UnifiedBalanceCard showBreakdown={true} />
      </div>

      {/* Pado Balance Management */}
      <div className="mb-6">
        <MarginAccountCard />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1.5 sm:gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 px-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-pd2 text-white'
                : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 md:p-6">
        {activeTab === 'send' && (
          <div key={remountKey}>
            <SendTransaction />
          </div>
        )}

        {activeTab === 'receive' && (
          <div>
            {isConnected ? (
              <PaymentQRCode />
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-text-muted">
                  Connect your wallet to view your receive address
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <TransferHistory />
        )}

        {activeTab === 'settings' && (
          <SecuritySettings />
        )}
      </div>
    </div>
  );
}
