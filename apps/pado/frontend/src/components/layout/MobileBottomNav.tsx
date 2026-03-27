/**
 * MobileBottomNav
 * 5-tab bottom navigation bar for mobile (< md breakpoint).
 *
 * Tabs: Home | Trade | Predict | Social | More
 * - Fixed at bottom with safe-area padding for iOS notch
 * - Hidden on md+ (desktop uses header nav)
 * - "More" opens a bottom sheet overlay with secondary features
 */

import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAccess } from '../../features/admin';

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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Trade',
    path: '/markets/spot',
    matchPaths: ['/markets', '/trade'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <polyline points="7 17 2 12 7 7" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="17 7 22 12 17 17" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="2" y1="12" x2="15" y2="12" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="9" y1="12" x2="22" y2="12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Leisure',
    path: '/leisure/lottery',
    matchPaths: ['/leisure'],
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
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
];

// Bottom sheet menu items
const MORE_ITEMS = [
  { label: 'Earn', path: '/earn', icon: '💰' },
  { label: 'Perpetuals', path: '/markets/perp', icon: '📈' },
  { label: 'Portfolio', path: '/portfolio', icon: '📊' },
  { label: 'Wallet', path: '/wallet', icon: '👛' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { isAdmin } = useAdminAccess();

  // Close bottom sheet on route change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  const isTabActive = (tab: NavTab) => {
    if (tab.path === '/') return location.pathname === '/';
    return tab.matchPaths.some(p => location.pathname.startsWith(p));
  };

  const isMoreActive = MORE_ITEMS.some(item =>
    location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  ) || (isAdmin && location.pathname.startsWith('/admin'));

  return (
    <>
      {/* Bottom Sheet Overlay */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={() => setIsMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-14 left-0 right-0 bg-theme-bg-secondary border-t border-theme-border rounded-t-2xl shadow-2xl animate-slide-up"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-theme-text-muted/30" />
            </div>
            <nav className="px-4 pb-4 grid grid-cols-3 gap-2">
              {MORE_ITEMS.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsMoreOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors ${
                    location.pathname.startsWith(item.path)
                      ? 'bg-theme-accent/10 text-theme-accent'
                      : 'text-theme-text-secondary hover:bg-theme-bg-tertiary'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => {
                    navigate('/admin');
                    setIsMoreOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-yellow-400/10 text-yellow-400'
                      : 'text-yellow-500 hover:bg-yellow-400/10'
                  }`}
                >
                  <span className="text-xl">⚙️</span>
                  <span className="text-xs font-medium">Admin</span>
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-theme-bg-secondary border-t border-theme-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around h-14">
          {TABS.map((tab) => {
            const active = isTabActive(tab);
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

          {/* More button */}
          <button
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              isMoreOpen || isMoreActive ? 'text-theme-accent' : 'text-theme-text-muted'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isMoreOpen || isMoreActive ? 2.2 : 1.8}>
              <rect x="3" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`text-[10px] mt-0.5 ${isMoreOpen || isMoreActive ? 'font-semibold' : 'font-medium'}`}>
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
