/**
 * ActivityTabs Component
 * Tab container for Trades and Transfers history
 */

import { useState } from 'react';
import { RecentTrades } from './RecentTrades';
import { TransferHistory } from './TransferHistory';

type ActivityTab = 'trades' | 'transfers';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2.5 text-sm font-medium transition-colors
        ${active
          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
          : 'text-theme-text-secondary hover:text-theme-text-primary border-b-2 border-transparent'
        }
      `}
    >
      {children}
    </button>
  );
}

export function ActivityTabs() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('trades');

  return (
    <div className="bg-theme-bg-secondary rounded-lg overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b border-theme-border">
        <TabButton
          active={activeTab === 'trades'}
          onClick={() => setActiveTab('trades')}
        >
          Trades
        </TabButton>
        <TabButton
          active={activeTab === 'transfers'}
          onClick={() => setActiveTab('transfers')}
        >
          Transfers
        </TabButton>
      </div>

      {/* Tab Content */}
      {activeTab === 'trades' ? <RecentTrades embedded /> : <TransferHistory />}
    </div>
  );
}
