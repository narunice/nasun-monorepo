import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WalletConnect } from '@nasun/wallet-ui';

interface NavItem {
  label: string;
  path: string;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Trade', path: '/trade', enabled: true },
  { label: 'Send', path: '/send', enabled: true },
  { label: 'Perps', path: '/perps', enabled: false },
  { label: 'Lend', path: '/lend', enabled: false },
  { label: 'Predict', path: '/predict', enabled: false },
  { label: 'Stake', path: '/stake', enabled: false },
  { label: 'Portfolio', path: '/portfolio', enabled: true },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/trade') {
      return location.pathname === '/' || location.pathname === '/trade';
    }
    return location.pathname === path;
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
    <header className="border-b border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo + App Name */}
        <div className="flex items-center gap-2">
          <img src="/temp-logo.png" alt="Pado" className="w-8 h-8" />
          <h1 className="text-2xl font-bold text-blue-400">Pado</h1>
        </div>

        {/* Navigation Menu */}
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
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.path}
                className="px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                title="Coming Soon"
              >
                {item.label}
              </span>
            )
          )}
        </nav>

        {/* Wallet Connect */}
        <div className="flex items-center gap-4">
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
