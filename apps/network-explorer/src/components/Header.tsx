import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { networkConfig } from "../lib/sui-client";
import { WalletConnect } from "@nasun/wallet-ui";
import { ThemeToggle } from "./theme/ThemeToggle";

interface HeaderProps {
  showNetworkName?: boolean;
}

export default function Header({ showNetworkName = false }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-6">
            {/* Mobile hamburger menu button */}
            <button
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>

            <Link
              to="/"
              className="text-xl md:text-2xl font-bold text-foreground"
            >
              <span className="hidden sm:inline">Nasun Explorer</span>
              <span className="sm:hidden">Explorer</span>
            </Link>

            {/* Desktop navigation */}
            <nav className="hidden md:flex items-center gap-4">
              <Link
                to="/transactions"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Transactions
              </Link>
              <Link
                to="/validators"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Validators
              </Link>
              <Link
                to="/checkpoints"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Checkpoints
              </Link>
              <Link
                to="/package/0x2"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Packages
              </Link>
              <Link
                to="/analytics"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Analytics
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {showNetworkName && (
              <div className="text-sm text-muted-foreground hidden sm:block">
                {networkConfig.name}
              </div>
            )}

            <ThemeToggle />
            <WalletConnect />
          </div>
        </div>
      </div>

      {/* Mobile navigation dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-background border-b border-border z-50">
          <nav className="flex flex-col px-4 py-3 gap-1">
            <Link
              to="/transactions"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Transactions
            </Link>
            <Link
              to="/validators"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Validators
            </Link>
            <Link
              to="/checkpoints"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Checkpoints
            </Link>
            <Link
              to="/package/0x2"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Packages
            </Link>
            <Link
              to="/analytics"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Analytics
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
