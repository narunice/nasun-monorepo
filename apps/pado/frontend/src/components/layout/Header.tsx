import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WalletConnect } from '@nasun/wallet-ui';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { HeaderNetValue } from './HeaderNetValue';
import { EcoPointsBadge } from './EcoPointsBadge';
import { GenesisPassBadge } from '@nasun/wallet-ui';
import { useGenesisPass } from '../../hooks/useGenesisPass';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAdminAccess } from '../../features/admin';
import { useTradeMode } from '../../features/trading/hooks';
import { hasAccess } from '../../config/network';
import { useAppAdmin } from '../../hooks/useAppAdmin';

interface NavItem {
  label: string;
  path: string;
  enabled: boolean;
}

interface DropdownItem {
  label: string;
  path: string;
  enabled: boolean;
}

// TEMPORARY: access-level gating (Remove after 2026-07-01)
const TRADE_ITEMS: DropdownItem[] = [
  { label: 'Spot', path: '/markets/spot', enabled: hasAccess('spot') },
  { label: 'Perpetuals', path: '/markets/perp', enabled: hasAccess('full') },
];

const GAMES_ITEMS: DropdownItem[] = [
  { label: 'Lottery', path: '/games/lottery', enabled: true },
  { label: 'Scratch Cards', path: '/games/scratch', enabled: true },
  { label: 'Number Match', path: '/games/numbermatch', enabled: true },
  { label: 'History', path: '/games/history', enabled: true },
];

// /predict is temporarily repurposed as the Ideas & Feedback form (pre-launch).
// Keep the menu label as "Predict" but force-enable it so the route is reachable
// regardless of accessMode.
const IDEA_MODE = import.meta.env.VITE_IDEA_SUBMISSION_ENABLED === 'true';

const NAV_ITEMS: NavItem[] = [
  { label: 'Predict', path: '/predict', enabled: IDEA_MODE || hasAccess('full') },
  { label: 'Earn', path: '/earn', enabled: hasAccess('full') },
];

const SOCIAL_ITEMS: DropdownItem[] = [
  { label: 'Leaderboard', path: '/leaderboard', enabled: hasAccess('spot') },
  { label: 'Competitions', path: '/competitions', enabled: hasAccess('full') },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [isGamesOpen, setIsGamesOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tradeRef = useRef<HTMLDivElement>(null);
  const gamesRef = useRef<HTMLDivElement>(null);
  const socialRef = useRef<HTMLDivElement>(null);

  // Detect mobile viewport for address shortening
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Wallet connection state
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();

  // Admin access check
  const { isAdmin } = useAdminAccess();
  const isAppAdmin = useAppAdmin();

  // Genesis Pass ownership
  const hasGenesisPass = useGenesisPass();

  // Platform admins bypass all access gates
  const hasSpotAccess = isAppAdmin || hasAccess('spot');

  // Trade mode for header max-width in Simple mode
  const { isSimple } = useTradeMode();
  const isTradePage = location.pathname.startsWith('/markets');

  // Passkey state
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  // Hide wallet button on homepage only when no wallet exists (WelcomeBanner has "Get Started")
  // Show it when locked (unlock from header) or connected
  const isHomePage = location.pathname === '/';
  const showWalletButton = !isHomePage || status !== 'disconnected' || isZkLoggedIn || isPasskeyUnlocked;

  // Close dropdowns on route change
  useEffect(() => {
    setIsTradeOpen(false);
    setIsGamesOpen(false);
    setIsSocialOpen(false);
  }, [location.pathname]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tradeRef.current && !tradeRef.current.contains(event.target as Node)) {
        setIsTradeOpen(false);
      }
      if (gamesRef.current && !gamesRef.current.contains(event.target as Node)) {
        setIsGamesOpen(false);
      }
      if (socialRef.current && !socialRef.current.contains(event.target as Node)) {
        setIsSocialOpen(false);
      }
    };

    if (isTradeOpen || isGamesOpen || isSocialOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTradeOpen, isGamesOpen, isSocialOpen]);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path === '/predict') {
      return location.pathname.startsWith('/predict');
    }
    if (path === '/markets') {
      return location.pathname.startsWith('/markets') || location.pathname === '/trade';
    }
    if (path === '/games') {
      return location.pathname.startsWith('/games');
    }
    if (path === '/social') {
      return location.pathname.startsWith('/leaderboard') || location.pathname.startsWith('/competitions');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Handle nav click - refresh state if same route
  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (isActive(path)) {
      e.preventDefault();
      // Navigate with new state to trigger remount
      // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in event handlers
      navigate(path, { state: { key: Date.now() }, replace: true });
    }
  };

  const toggleTrade = () => {
    setIsTradeOpen((prev) => !prev);
    setIsGamesOpen(false);
    setIsSocialOpen(false);
  };

  const toggleGames = () => {
    setIsGamesOpen((prev) => !prev);
    setIsTradeOpen(false);
    setIsSocialOpen(false);
  };

  const toggleSocial = () => {
    setIsSocialOpen((prev) => !prev);
    setIsTradeOpen(false);
    setIsGamesOpen(false);
  };

  return (
    <header className="border-b border-theme-border px-3 sm:px-4 md:px-6 py-3 md:py-4">
      <div className={`flex items-center justify-between gap-2 ${
        isHomePage
          ? 'max-w-7xl mx-auto'
          : isTradePage && isSimple
            ? 'xl:max-w-[1400px] 2xl:max-w-[1520px] xl:mx-auto'
            : ''
      }`}>
        {/* Logo Wordmark - Click to go Home */}
        <Link to="/" className="hover:opacity-80 transition-opacity flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-brand tracking-wider text-pd3">PADO</h1>
          <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-pd3/15 text-pd3 border border-pd3/30 rounded">
            Nasun Devnet
          </span>
        </Link>

        {/* Desktop Navigation Menu */}
        <nav className="hidden md:flex items-center gap-1">
          {/* Trade Dropdown */}
          <div className="relative" ref={tradeRef}>
            {TRADE_ITEMS.length > 0 ? (
              <>
                <button
                  onClick={toggleTrade}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                    isActive('/markets')
                      ? 'text-pd3 bg-pd3/10'
                      : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
                  }`}
                >
                  Trade
                  <svg
                    className={`w-3 h-3 transition-transform ${isTradeOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isTradeOpen && (
                  <div className="absolute left-0 top-full mt-1 w-40 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                    {TRADE_ITEMS.map((item) => {
                      const enabled = item.enabled || isAppAdmin;
                      if (enabled) {
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={(e) => {
                              handleNavClick(e, item.path);
                              setIsTradeOpen(false);
                            }}
                            className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                              isActive(item.path)
                                ? 'text-pd3 bg-pd3/10'
                                : 'text-theme-text-primary hover:bg-theme-bg-tertiary'
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      }
                      return (
                        <span
                          key={item.path}
                          className="flex items-center justify-between px-4 py-2.5 text-sm font-medium text-theme-text-muted/40 cursor-not-allowed"
                        >
                          {item.label}
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <span className="group/nav px-3 py-2 text-sm font-medium rounded-md text-theme-text-muted cursor-not-allowed flex items-center gap-1">
                Trade
                <svg className="w-3.5 h-3.5 opacity-0 group-hover/nav:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </span>
            )}
          </div>

          {/* Games Dropdown */}
          <div className="relative" ref={gamesRef}>
            <button
              onClick={toggleGames}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                isActive('/games')
                  ? 'text-pd3 bg-pd3/10'
                  : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
              }`}
            >
              Games
              <svg
                className={`w-3 h-3 transition-transform ${isGamesOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isGamesOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                {GAMES_ITEMS.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={(e) => {
                      handleNavClick(e, item.path);
                      setIsGamesOpen(false);
                    }}
                    className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive(item.path)
                        ? 'text-pd3 bg-pd3/10'
                        : 'text-theme-text-primary hover:bg-theme-bg-tertiary'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Direct Nav Items: Predict, Earn */}
          {NAV_ITEMS.map((item) => {
            const enabled = item.enabled || isAppAdmin;
            return enabled ? (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => handleNavClick(e, item.path)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive(item.path)
                    ? 'text-pd3 bg-pd3/10'
                    : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.path}
                className="group/nav px-3 py-2 text-sm font-medium rounded-md text-theme-text-muted cursor-not-allowed inline-flex items-center gap-1"
              >
                {item.label}
                <svg className="w-3.5 h-3.5 opacity-0 group-hover/nav:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </span>
            );
          })}

          {/* Social Dropdown */}
          <div className="relative" ref={socialRef}>
            {SOCIAL_ITEMS.length > 0 ? (
              <button
                onClick={toggleSocial}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                  isActive('/social')
                    ? 'text-pd3 bg-pd3/10'
                    : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
                }`}
              >
                Social
                <svg
                  className={`w-3 h-3 transition-transform ${isSocialOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ) : (
              <span className="group/nav px-3 py-2 text-sm font-medium rounded-md text-theme-text-muted cursor-not-allowed flex items-center gap-1">
                Social
                <svg className="w-3.5 h-3.5 opacity-0 group-hover/nav:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </span>
            )}

            {isSocialOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                {SOCIAL_ITEMS.map((item) => {
                  const enabled = item.enabled || isAppAdmin;
                  if (enabled) {
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={(e) => {
                          handleNavClick(e, item.path);
                          setIsSocialOpen(false);
                        }}
                        className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                          isActive(item.path)
                            ? 'text-pd3 bg-pd3/10'
                            : 'text-theme-text-primary hover:bg-theme-bg-tertiary'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  }
                  return (
                    <span
                      key={item.path}
                      className="flex items-center justify-between px-4 py-2.5 text-sm font-medium text-theme-text-muted/40 cursor-not-allowed"
                    >
                      {item.label}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Portfolio */}
          {hasSpotAccess ? (
            <Link
              to="/portfolio"
              onClick={(e) => handleNavClick(e, '/portfolio')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive('/portfolio')
                  ? 'text-pd3 bg-pd3/10'
                  : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
              }`}
            >
              Portfolio
            </Link>
          ) : (
            <span className="group/nav px-3 py-2 text-sm font-medium rounded-md text-theme-text-muted cursor-not-allowed inline-flex items-center gap-1">
              Portfolio
              <svg className="w-3.5 h-3.5 opacity-0 group-hover/nav:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </span>
          )}

          {/* Admin (conditional) */}
          {isAdmin && (
            <Link
              to="/admin"
              onClick={(e) => handleNavClick(e, '/admin')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive('/admin')
                  ? 'text-yellow-400 bg-yellow-400/10'
                  : 'text-yellow-500 hover:text-yellow-400 hover:bg-yellow-400/10'
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        {/* Right side: Theme Toggle + Wallet */}
        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          <EcoPointsBadge />
          {hasGenesisPass && <GenesisPassBadge className="hidden sm:inline-flex" />}
          {hasSpotAccess && <HeaderNetValue />}
          {showWalletButton && (
            <WalletConnect
              addressStartChars={isMobile ? 0 : 2}
              addressEndChars={3}
            />
          )}
        </div>
      </div>
    </header>
  );
}
