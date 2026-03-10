/**
 * AdminTabs - Tab navigation for Leaderboard V3 Admin
 */

import { cn } from '../../../../utils/utils';

export type AdminTabId = 'dashboard' | 'post' | 'leaderboard' | 'adjust' | 'seasons';

interface AdminTab {
  id: AdminTabId;
  label: string;
  icon: string;
}

const ADMIN_TABS: AdminTab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'post', label: 'Post', icon: '📝' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'adjust', label: 'Adjust', icon: '⚖️' },
  { id: 'seasons', label: 'Seasons', icon: '📅' },
];

interface AdminTabsProps {
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
}

export function AdminTabs({ activeTab, onTabChange }: AdminTabsProps) {
  return (
    <div className="flex gap-1 p-1 bg-gray-800/50 rounded-sm border border-nasun-c5/20">
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all',
            activeTab === tab.id
              ? 'bg-nasun-c4 text-nasun-white shadow-lg'
              : 'text-nasun-white/60 hover:text-nasun-white hover:bg-gray-700/50'
          )}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
