/**
 * DashboardSidebar - Left navigation with Dashboard/Chat tab split
 *
 * Dashboard tab: Overview, Agents, Execution Reports navigation
 * Chat tab: Session management (NewChat, SessionList, ClearHistory)
 *
 * Tab selection is derived from the current URL:
 *   /chat -> Chat tab
 *   everything else -> Dashboard tab
 */

import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NewChatButton } from '../sidebar/NewChatButton';
import { SessionList } from '../sidebar/SessionList';
import { SidebarSettings } from '../sidebar/SidebarSettings';

interface DashboardSidebarProps {
  isOpen: boolean;
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: GridIcon, end: true },
  { to: '/agents', label: 'Agents', icon: AgentIcon },
  { to: '/aer', label: 'Execution Reports', icon: ReportIcon },
] as const;

export function DashboardSidebar({ isOpen }: DashboardSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isChatTab = location.pathname === '/chat';

  const handleTabClick = (tab: 'dashboard' | 'chat') => {
    if (tab === 'chat' && !isChatTab) navigate('/chat');
    if (tab === 'dashboard' && isChatTab) navigate('/');
  };

  const tabBaseStyle = 'flex-1 py-2 text-xs font-medium transition-colors text-center';
  const tabActiveStyle = 'text-[var(--color-text-primary)] border-b-2 border-[var(--color-accent)]';
  const tabInactiveStyle = 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]';

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
      <div className="px-4 py-4 border-b border-[var(--color-border)] shrink-0">
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
          Baram
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          AI Agent Compliance
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border)] shrink-0">
        <button
          onClick={() => handleTabClick('dashboard')}
          className={`${tabBaseStyle} ${isChatTab ? tabInactiveStyle : tabActiveStyle}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <GridIcon />
            Dashboard
          </span>
        </button>
        <button
          onClick={() => handleTabClick('chat')}
          className={`${tabBaseStyle} ${isChatTab ? tabActiveStyle : tabInactiveStyle}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <ChatIcon />
            Chat
          </span>
        </button>
      </div>

      {/* Tab content */}
      {isChatTab ? (
        <>
          {/* New Chat button */}
          <div className="p-3 shrink-0">
            <NewChatButton />
          </div>

          {/* Session list (scrollable) */}
          <div className="flex-1 overflow-y-auto">
            <SessionList />
          </div>

          {/* Clear history */}
          <div className="border-t border-[var(--color-border)] shrink-0">
            <SidebarSettings />
          </div>
        </>
      ) : (
        <>
          {/* Dashboard navigation */}
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
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] shrink-0">
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
