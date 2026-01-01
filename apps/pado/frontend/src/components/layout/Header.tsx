import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WalletConnect } from '@nasun/wallet-ui';
import { useTheme } from '../../providers/theme';

interface NavItem {
  label: string;
  path: string;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', enabled: true },
  { label: 'Trade', path: '/trade', enabled: true },
  { label: 'Earn', path: '/earn', enabled: false },
  { label: 'Predict', path: '/predict', enabled: true },
  { label: 'Wallet', path: '/wallet', enabled: true },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path === '/predict') {
      return location.pathname.startsWith('/predict');
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
    <header className="border-b border-theme-border px-4 md:px-6 py-3 md:py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo + App Name */}
        <div className="flex items-center gap-2">
          <img src="/temp-logo.png" alt="Pado" className="w-7 h-7 md:w-8 md:h-8" />
          <h1 className="text-xl md:text-2xl font-bold text-blue-400">Pado</h1>
        </div>

        {/* Desktop Navigation Menu */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => handleNavClick(e, item.path)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive(item.path)
                    ? 'text-blue-400 bg-blue-400/10'
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
        </nav>

        {/* Right side: Theme Toggle + Wallet (+ Mobile Menu) */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Theme Toggle Switch */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-0.5 p-1 rounded-full bg-theme-bg-secondary hover:bg-theme-bg-tertiary transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {/* Sun icon (left) - active in light mode */}
            <span className={`p-1 md:p-1.5 rounded-full transition-colors ${
              theme === 'light' ? 'bg-yellow-400 text-yellow-900' : 'text-theme-text-muted'
            }`}>
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            </span>
            {/* Moon icon (right) - active in dark mode */}
            <span className={`p-1 md:p-1.5 rounded-full transition-colors ${
              theme === 'dark' ? 'bg-blue-500 text-white' : 'text-theme-text-muted'
            }`}>
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            </span>
          </button>

          <WalletConnect />

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
                          ? 'text-blue-400 bg-blue-400/10'
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
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
