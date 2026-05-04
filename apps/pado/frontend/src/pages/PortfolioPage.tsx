/**
 * PortfolioPage
 * Tabbed dashboard combining analytics (Overview / Performance / Activity)
 * and fund management (Balance).
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SendTransaction, SecuritySettings } from '@nasun/wallet-ui';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import {
  AssetOverview,
  AllocationDonut,
  PnlChart,
  TokenBalanceList,
  TradeStats,
  MarketPerformance,
  ActivityTabs,
} from '../features/portfolio/components';
import { TransferHistory } from '../features/portfolio/components/TransferHistory';
import { UnifiedBalanceCard, MarginAccountCard } from '../features/core/unified-margin';
import { PaymentQRCode } from '../features/payments';
import { BalancePasswordGate } from '../components/common/BalancePasswordGate';

type TabId = 'overview' | 'performance' | 'activity' | 'balance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'activity', label: 'Activity' },
  { id: 'balance', label: 'Pado Balance' },
];

const VALID_TABS = new Set<TabId>(TABS.map((t) => t.id));

function isTabId(value: string | null): value is TabId {
  return value !== null && VALID_TABS.has(value as TabId);
}

export function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTabParam = searchParams.get('tab');
  // Redirect legacy ?tab=pocket URLs to the canonical ?tab=balance.
  const tabParam = rawTabParam === 'pocket' ? 'balance' : rawTabParam;
  const activeTab: TabId = isTabId(tabParam) ? tabParam : 'overview';

  const setActiveTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <span className="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10 border border-yellow-300 dark:border-yellow-400/30 px-2 py-0.5 rounded">
          FEATURE PREVIEW
        </span>
      </div>

      {/* Top-level tab nav */}
      <div className="flex gap-1.5 sm:gap-2 border-b border-theme-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-pd2 text-theme-text-primary'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AssetOverview />
            <AllocationDonut />
          </div>
          <TokenBalanceList />
        </>
      )}

      {activeTab === 'performance' && (
        <>
          <PnlChart />
          <TradeStats />
          <MarketPerformance />
        </>
      )}

      {activeTab === 'activity' && <ActivityTabs />}

      {activeTab === 'balance' && (
        <BalancePasswordGate>
          <BalanceTab />
        </BalancePasswordGate>
      )}
    </div>
  );
}

type BalanceSubTab = 'send' | 'receive' | 'history' | 'settings';

const BALANCE_SUB_TABS: { id: BalanceSubTab; label: string }[] = [
  { id: 'send', label: 'Send' },
  { id: 'receive', label: 'Receive' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

function BalanceTab() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked;

  const [activeSubTab, setActiveSubTab] = useState<BalanceSubTab>('send');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-theme-text-primary">Pado Balance</h2>
        <p className="text-sm text-theme-text-secondary mt-1">
          Your unified funds for Spot, Predict, and Earn
        </p>
      </div>

      <div className="mb-6">
        <UnifiedBalanceCard showBreakdown={true} />
      </div>

      <div className="mb-6">
        <MarginAccountCard />
      </div>

      <div className="flex gap-1.5 sm:gap-2 mb-6">
        {BALANCE_SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex-1 py-2.5 px-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
              activeSubTab === tab.id
                ? 'bg-pd2 text-white'
                : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 md:p-6">
        {activeSubTab === 'send' && <SendTransaction />}
        {activeSubTab === 'receive' && (
          isConnected ? (
            <PaymentQRCode />
          ) : (
            <div className="text-center py-8">
              <p className="text-theme-text-muted">
                Connect your wallet to view your receive address
              </p>
            </div>
          )
        )}
        {activeSubTab === 'history' && <TransferHistory />}
        {activeSubTab === 'settings' && <SecuritySettings />}
      </div>
    </div>
  );
}
