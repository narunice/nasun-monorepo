/**
 * Sidebar - Main sidebar container with chat history and settings
 */

import { NewChatButton } from './NewChatButton';
import { SessionList } from './SessionList';
import { SidebarSettings } from './SidebarSettings';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
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
          h-full w-60 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]
          flex flex-col
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0'}
        `}
      >
        {/* Header with toggle */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-baram-1 to-baram-2 flex items-center justify-center">
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

        {/* New Chat Button */}
        <div className="p-3">
          <NewChatButton />
        </div>

        {/* Session List (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          <SessionList />
        </div>

        {/* Settings (Executor/Model selection) */}
        <div className="border-t border-[var(--color-border)]">
          <SidebarSettings />
        </div>
      </aside>
    </>
  );
}
