/**
 * ChatLayout - Main layout with left sidebar and chat area
 *
 * ChatGPT-style layout:
 * ┌──────────────┬──────────────────────────────────────────────┐
 * │ SIDEBAR      │  MAIN CHAT AREA                              │
 * │ (240px)      │                                              │
 * │              │  Header                                      │
 * │ [+ New Chat] │  ─────────────────────────────────────────── │
 * │              │  Content (messages or welcome)               │
 * │ HISTORY      │                                              │
 * │ ○ Today      │                                              │
 * │   • Chat 1   │                                              │
 * │              │  ─────────────────────────────────────────── │
 * │ SETTINGS     │  Input Area                                  │
 * │ Executor ▼   │                                              │
 * └──────────────┴──────────────────────────────────────────────┘
 */

import { ReactNode, useState } from 'react';
import { Sidebar } from '../components/sidebar/Sidebar';

interface ChatLayoutProps {
  children: ReactNode;
  header: ReactNode;
  inputArea: ReactNode;
}

export function ChatLayout({ children, header, inputArea }: ChatLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-[var(--color-bg-primary)]">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {header}

        {/* Content Area (scrollable) */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>

        {/* Input Area (fixed at bottom) */}
        <div className="bg-[var(--color-bg-primary)]">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {inputArea}
          </div>
        </div>
      </div>

      {/* Sidebar toggle button (visible when sidebar is closed) */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          aria-label="Open sidebar"
        >
          <svg className="w-5 h-5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
