import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WalletConnect } from '@nasun/wallet-ui';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { HeaderNetValue } from './HeaderNetValue';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAdminAccess } from '../../features/admin';

interface NavItem {
  label: string;
  path: string;
  enabled: boolean;
}

interface MarketsSubItem {
  label: string;
  path: string;
  enabled: boolean;
}

const MARKETS_ITEMS: MarketsSubItem[] = [
  { label: 'Spot', path: '/markets/spot', enabled: true },
  { label: 'Perp', path: '/markets/perp', enabled: true },
];

const NAV_ITEMS: NavItem[] = [
  { label: 'Predict', path: '/predict', enabled: true },
  { label: 'Lottery', path: '/lottery', enabled: true },
  { label: 'Earn', path: '/earn', enabled: true },
  { label: 'Wallet', path: '/wallet', enabled: true },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const marketsRef = useRef<HTMLDivElement>(null);

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

  // Hide wallet button on homepage only when no wallet exists (WelcomeBanner has "Get Started")
  // Show it when locked (unlock from header) or connected
  const isHomePage = location.pathname === '/';
  const showWalletButton = !isHomePage || status !== 'disconnected' || isZkLoggedIn;

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMarketsOpen(false);
  }, [location.pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
      if (marketsRef.current && !marketsRef.current.contains(event.target as Node)) {
        setIsMarketsOpen(false);
      }
    };

    if (isMobileMenuOpen || isMarketsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen, isMarketsOpen]);

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
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Handle nav click - refresh state if same route
  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (isActive(path)) {
      e.preventDefault();
      // Navigate with new state to trigger remount
      navigate(path, { state: { key: Date.now() }, replace: true });
    }
  };

  return (
    <header className="border-b border-theme-border px-3 sm:px-4 md:px-6 py-3 md:py-4">
      <div className={`flex items-center justify-between gap-2 ${isHomePage ? 'max-w-7xl mx-auto' : ''}`}>
        {/* Logo Wordmark - Click to go Home */}
        <Link to="/" className="hover:opacity-80 transition-opacity">
          <h1 className="text-xl md:text-2xl font-brand tracking-wider text-pd3">PADO</h1>
        </Link>

        {/* Desktop Navigation Menu */}
        <nav className="hidden md:flex items-center gap-1">
          {/* Markets Dropdown */}
          <div className="relative" ref={marketsRef}>
            <button
              onClick={() => setIsMarketsOpen(!isMarketsOpen)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                isActive('/markets')
                  ? 'text-pd3 bg-pd3/10'
                  : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
              }`}
            >
              Markets
              <svg
                className={`w-3 h-3 transition-transform ${isMarketsOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Markets Dropdown Menu */}
            {isMarketsOpen && (
              <div className="absolute left-0 top-full mt-1 w-40 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                {MARKETS_ITEMS.map((item) =>
                  item.enabled ? (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={(e) => {
                        handleNavClick(e, item.path);
                        setIsMarketsOpen(false);
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

          {/* Other Nav Items */}
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

        {/* Right side: Theme Toggle + Wallet (+ Mobile Menu) */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Theme Toggle Switch */}
          <ThemeToggle />

          {/* Net Value (visible when connected, hidden on mobile) */}
          <HeaderNetValue />

          {showWalletButton && (
            <WalletConnect
              addressStartChars={isMobile ? 0 : 2}
              addressEndChars={3}
            />
          )}

          {/* Mobile Menu Button */}
          <div className="md:hidden relative" ref={mobileMenuRef}>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md bg-theme-bg-secondary hover:bg-theme-bg-tertiary transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            {/* Mobile Dropdown Menu */}
            {isMobileMenuOpen && (
              <nav className="absolute right-0 top-full mt-2 w-48 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                {/* Markets Section */}
                <div className="border-b border-theme-border">
                  <div className="px-4 py-2 text-xs font-medium text-theme-text-muted uppercase tracking-wider">
                    Markets
                  </div>
                  {MARKETS_ITEMS.map((item) =>
                    item.enabled ? (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={(e) => {
                          handleNavClick(e, item.path);
                          setIsMobileMenuOpen(false);
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

                {/* Other Nav Items */}
                {NAV_ITEMS.map((item) =>
                  item.enabled ? (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={(e) => {
                        handleNavClick(e, item.path);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`block px-4 py-3 text-sm font-medium transition-colors ${
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
                      className="block px-4 py-3 text-sm text-theme-text-muted cursor-not-allowed"
                    >
                      {item.label}
                      <span className="text-xs ml-1">(Soon)</span>
                    </span>
                  )
                )}
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={(e) => {
                      handleNavClick(e, '/admin');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`block px-4 py-3 text-sm font-medium transition-colors border-t border-theme-border ${
                      isActive('/admin')
                        ? 'text-yellow-400 bg-yellow-400/10'
                        : 'text-yellow-500 hover:bg-yellow-400/10'
                    }`}
                  >
                    Admin
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
