/**
 * MobileBottomNav
 * 5-tab bottom navigation bar for mobile (< md breakpoint).
 * Benchmarked from Binance, Bybit, Coinbase mobile apps.
 *
 * Tabs: Home | Markets | Trade | Social | Wallet
 * - Fixed at bottom with safe-area padding for iOS notch
 * - Hidden on md+ (desktop uses header nav)
 */

import { Link, useLocation } from 'react-router-dom';

interface NavTab {
  label: string;
  path: string;
  icon: (active: boolean) => React.ReactNode;
  matchPaths: string[];
}

const TABS: NavTab[] = [
  {
    label: 'Home',
    path: '/',
    matchPaths: ['/'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'currentColor' : 'currentColor'} strokeWidth={active ? 2.2 : 1.8}>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Markets',
    path: '/markets/spot',
    matchPaths: ['/markets'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Trade',
    path: '/trade',
    matchPaths: ['/trade'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Social',
    path: '/leaderboard',
    matchPaths: ['/leaderboard', '/competitions'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Wallet',
    path: '/wallet',
    matchPaths: ['/wallet'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function MobileBottomNav() {
  const location = useLocation();

  const isActive = (tab: NavTab) => {
    // Exact match for home
    if (tab.path === '/') return location.pathname === '/';
    // Prefix match for trade page
    if (tab.matchPaths.includes('/trade')) {
      return location.pathname === '/trade' || location.pathname.startsWith('/trade/');
    }
    return tab.matchPaths.some(p => location.pathname.startsWith(p));
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-theme-bg-secondary border-t border-theme-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.label}
              to={tab.path}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                active ? 'text-theme-accent' : 'text-theme-text-muted'
              }`}
            >
              {tab.icon(active)}
              <span className={`text-[10px] mt-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
