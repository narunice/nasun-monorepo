/**
 * DashboardSidebar - Left navigation for the AER dashboard
 */

import { NavLink } from 'react-router-dom';

interface DashboardSidebarProps {
  isOpen: boolean;
}

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: GridIcon, end: true },
  { to: '/agents', label: 'Agents', icon: AgentIcon },
  { to: '/aer', label: 'Execution Reports', icon: ReportIcon },
  { to: '/chat', label: 'Chat', icon: ChatIcon },
] as const;

export function DashboardSidebar({ isOpen }: DashboardSidebarProps) {
  return (
    <aside
      className={`
        fixed md:relative z-30 h-full
        w-[220px] bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]
        flex flex-col transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:border-0 md:overflow-hidden'}
      `}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[var(--color-border)]">
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
          Baram AER
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          AI Agent Compliance
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--color-border)]">
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Nasun Devnet
        </p>
      </div>
    </aside>
  );
}

// Inline SVG icons (minimal, 16x16)
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
      <path d="M5 5h6M5 8h6M5 11h3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 2.5h11a1 1 0 011 1v7a1 1 0 01-1 1h-3l-3 3v-3h-5a1 1 0 01-1-1v-7a1 1 0 011-1z" />
    </svg>
  );
}
