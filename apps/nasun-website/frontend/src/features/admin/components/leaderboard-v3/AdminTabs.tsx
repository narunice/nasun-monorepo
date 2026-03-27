/**
 * AdminTabs - Tab navigation for Leaderboard V3 Admin
 */

import { cn } from '../../../../utils/utils';

export type AdminTabId = 'post' | 'adjust' | 'overview' | 'leaderboard' | 'seasons' | 'blacklist';

interface AdminTab {
  id: AdminTabId;
  label: string;
  icon: string;
}

const ADMIN_TABS: AdminTab[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'post', label: 'Post', icon: '📝' },
  { id: 'adjust', label: 'Adjust', icon: '⚖️' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'seasons', label: 'Seasons', icon: '📅' },
  { id: 'blacklist', label: 'Blacklist', icon: '🚫' },
];

interface AdminTabsProps {
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
}

export function AdminTabs({ activeTab, onTabChange }: AdminTabsProps) {
  return (
    <div className="flex gap-1 p-1 bg-gray-800/70 rounded-sm border border-nasun-c5/35">
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all',
            activeTab === tab.id
              ? 'bg-nasun-c4 text-nasun-white shadow-lg'
              : 'text-nasun-white/80 hover:text-nasun-white hover:bg-gray-700/70'
          )}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
