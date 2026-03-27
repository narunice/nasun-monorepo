import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WalletConnect } from '@nasun/wallet-ui';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { HeaderNetValue } from './HeaderNetValue';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAdminAccess } from '../../features/admin';
import { useTradeMode } from '../../features/trading/hooks';

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

const TRADE_ITEMS: DropdownItem[] = [
  { label: 'Spot', path: '/markets/spot', enabled: true },
  { label: 'Perpetuals', path: '/markets/perp', enabled: true },
];

const NAV_ITEMS: NavItem[] = [
  { label: 'Lottery', path: '/lottery', enabled: true },
  { label: 'Scratch', path: '/scratch', enabled: true },
  { label: 'Predict', path: '/predict', enabled: true },
  { label: 'Earn', path: '/earn', enabled: true },
];

const SOCIAL_ITEMS: DropdownItem[] = [
  { label: 'Leaderboard', path: '/leaderboard', enabled: true },
  { label: 'Competitions', path: '/competitions', enabled: true },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tradeRef = useRef<HTMLDivElement>(null);
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
    setIsSocialOpen(false);
  }, [location.pathname]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tradeRef.current && !tradeRef.current.contains(event.target as Node)) {
        setIsTradeOpen(false);
      }
      if (socialRef.current && !socialRef.current.contains(event.target as Node)) {
        setIsSocialOpen(false);
      }
    };

    if (isTradeOpen || isSocialOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTradeOpen, isSocialOpen]);

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
    setIsSocialOpen(false);
  };

  const toggleSocial = () => {
    setIsSocialOpen((prev) => !prev);
    setIsTradeOpen(false);
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
        <Link to="/" className="hover:opacity-80 transition-opacity">
          <h1 className="text-xl md:text-2xl font-brand tracking-wider text-pd3">PADO</h1>
        </Link>

        {/* Desktop Navigation Menu */}
        <nav className="hidden md:flex items-center gap-1">
          {/* Trade Dropdown */}
          <div className="relative" ref={tradeRef}>
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
                {TRADE_ITEMS.map((item) =>
                  item.enabled ? (
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
                  ) : (
                    <span
                      key={item.path}
                      className="block px-4 py-2.5 text-sm text-theme-text-muted cursor-not-allowed"
                    >
                      {item.label}
                      <span className="text-xs ml-1 text-purple-400">(Soon)</span>
                    </span>
                  )
                )}
              </div>
            )}
          </div>

          {/* Direct Nav Items: Predict, Lottery, Earn */}
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
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
                className="px-3 py-2 text-sm text-theme-text-muted cursor-not-allowed"
                title="Coming Soon"
              >
                {item.label}
              </span>
            )
          )}

          {/* Social Dropdown */}
          <div className="relative" ref={socialRef}>
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

            {isSocialOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                {SOCIAL_ITEMS.map((item) =>
                  item.enabled ? (
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
                  ) : (
                    <span
                      key={item.path}
                      className="block px-4 py-2.5 text-sm text-theme-text-muted cursor-not-allowed"
                    >
                      {item.label}
                      <span className="text-xs ml-1 text-purple-400">(Soon)</span>
                    </span>
                  )
                )}
              </div>
            )}
          </div>

          {/* Portfolio */}
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
          <HeaderNetValue />
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
