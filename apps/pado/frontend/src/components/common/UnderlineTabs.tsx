/**
 * UnderlineTabs
 * Shared underline-style tab component for consistent UI across trading sections.
 * Used by: Orderbook, OrderForm, BottomTabPanel
 */

import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

interface UnderlineTabsProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** Optional content rendered on the right side (e.g., depth selector, Advanced badge) */
  rightContent?: ReactNode;
  /** Font size class, default: 'text-sm' */
  fontSize?: string;
}

export function UnderlineTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  rightContent,
  fontSize = 'text-sm',
}: UnderlineTabsProps<T>) {
  return (
    <div className="flex items-center justify-between border-b border-theme-border">
      <div className="flex overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 ${fontSize} font-medium whitespace-nowrap transition-colors border-b-[3px] -mb-[1px] ${
              activeTab === tab.id
                ? 'text-theme-text-primary border-pd3'
                : 'text-theme-text-muted border-transparent hover:text-theme-text-secondary hover:border-theme-border'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-trading-xs font-bold rounded-full bg-theme-accent/20 text-theme-accent">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {rightContent && (
        <div className="flex items-center shrink-0 pl-2">
          {rightContent}
        </div>
      )}
    </div>
  );
}
