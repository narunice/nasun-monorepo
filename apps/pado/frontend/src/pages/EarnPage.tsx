/**
 * EarnPage
 * Unified earn page with Staking and Lending tabs
 */

import { useState } from 'react';
import { StakingSection } from '../features/earn/components/StakingSection';

type TabType = 'staking' | 'lending';

interface TabConfig {
  id: TabType;
  label: string;
  enabled: boolean;
}

const TABS: TabConfig[] = [
  { id: 'staking', label: 'Staking', enabled: true },
  { id: 'lending', label: 'Lending', enabled: false },
];

export function EarnPage() {
  const [activeTab, setActiveTab] = useState<TabType>('staking');

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-theme-text-primary">Earn</h1>
        <p className="text-sm text-theme-text-secondary mt-1">
          Stake NASUN or lend assets to earn yield
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.enabled && setActiveTab(tab.id)}
            disabled={!tab.enabled}
            className={`px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-500 text-white'
                : tab.enabled
                  ? 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
                  : 'bg-theme-bg-secondary text-theme-text-muted cursor-not-allowed'
            }`}
            title={!tab.enabled ? 'Coming Soon' : undefined}
          >
            {tab.label}
            {!tab.enabled && (
              <span className="ml-1 text-xs opacity-60">(Soon)</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'staking' && <StakingSection />}

        {activeTab === 'lending' && (
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-theme-bg-tertiary rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-theme-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-theme-text-primary mb-2">
              Lending Coming Soon
            </h3>
            <p className="text-sm text-theme-text-muted max-w-md mx-auto">
              Deposit NUSDC to earn interest or borrow against your NBTC collateral.
              Stay tuned for updates!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
