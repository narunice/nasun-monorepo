/**
 * DashboardLayout - Main layout for the AER dashboard
 *
 * Structure:
 * ┌──────────────┬──────────────────────────────────────────────┐
 * │ SIDEBAR      │  HEADER                                      │
 * │ (220px)      │  ─────────────────────────────────────────── │
 * │              │                                              │
 * │ Overview     │  PAGE CONTENT                                │
 * │ Agents       │  (scrollable)                                │
 * │ AER          │                                              │
 * │ Chat         │                                              │
 * │              │                                              │
 * └──────────────┴──────────────────────────────────────────────┘
 */

import { ReactNode, useState } from 'react';
import { DashboardSidebar } from '../components/navigation/DashboardSidebar';
import { DashboardHeader } from '../components/navigation/DashboardHeader';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-[var(--color-bg-primary)]">
      {/* Sidebar */}
      <DashboardSidebar isOpen={isSidebarOpen} />

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
