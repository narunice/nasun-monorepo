/**
 * EarnPage
 * Unified earn page with Staking and Lending tabs
 */

import { useState } from 'react';
import { StakingSection, LendingSection } from '../features/earn/components';

type TabType = 'staking' | 'lending';

interface TabConfig {
  id: TabType;
  label: string;
  enabled: boolean;
}

const TABS: TabConfig[] = [
  { id: 'staking', label: 'Staking', enabled: true },
  { id: 'lending', label: 'Lending', enabled: true },
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

        {activeTab === 'lending' && <LendingSection />}
      </div>
    </div>
  );
}
