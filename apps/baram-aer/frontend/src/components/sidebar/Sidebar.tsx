/**
 * Sidebar - Main sidebar container with chat history, budgets, and settings
 */

import { useState } from 'react';
import { NewChatButton } from './NewChatButton';
import { SessionList } from './SessionList';
import { SidebarSettings } from './SidebarSettings';
import { SidebarTabs, type SidebarTab } from './SidebarTabs';
import { BudgetSection } from './BudgetSection';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          h-full bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]
          overflow-hidden
          transition-all duration-200 ease-in-out
          ${isOpen ? 'w-60' : 'w-0 border-r-0'}
        `}
      >
        {/* Inner container with fixed width to prevent content collapse */}
        <div className="w-60 h-full flex flex-col">
          {/* Header with toggle */}
          <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-br-1 to-br-2 flex items-center justify-center">
                <span className="text-white font-bold text-xs">B</span>
              </div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Baram</span>
            </div>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
              aria-label="Close sidebar"
            >
              <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Tab Bar */}
          <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab Content */}
          {activeTab === 'chats' ? (
            <>
              {/* New Chat Button */}
              <div className="p-3">
                <NewChatButton />
              </div>

              {/* Session List (scrollable) */}
              <div className="flex-1 overflow-y-auto">
                <SessionList />
              </div>
            </>
          ) : (
            <BudgetSection />
          )}

          {/* Settings (Executor/Model selection) */}
          <div className="border-t border-[var(--color-border)]">
            <SidebarSettings />

            {/* Community Links */}
            <div className="px-3 py-2 flex items-center justify-center gap-3 border-t border-[var(--color-border)]">
              <a
                href="https://x.com/Nasun_io"
                target="_blank"
                rel="noopener noreferrer"
                title="Twitter / X"
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="#"
                title="Discord (Coming Soon)"
                className="p-1.5 rounded-md text-[var(--color-text-muted)] opacity-50 cursor-default"
                onClick={(e) => e.preventDefault()}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                </svg>
              </a>
              <a
                href="https://nasun.io"
                target="_blank"
                rel="noopener noreferrer"
                title="Nasun.io"
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
