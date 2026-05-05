import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { WalletConnect } from "@nasun/wallet-ui";
import { useWallet, useZkLogin, usePasskeyStore } from "@nasun/wallet";
import { HeaderNetValue } from "./HeaderNetValue";
import { GenesisPassBadge } from "@nasun/wallet-ui";
import { useGenesisPass } from "../../hooks/useGenesisPass";
import { ThemeToggle } from "../theme/ThemeToggle";
import { useAdminAccess } from "../../features/admin";
import { hasAccess } from "../../config/network";
import { useAppAdmin } from "../../hooks/useAppAdmin";

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

const NAV_ITEMS: NavItem[] = [
  { label: "Spot", path: "/spot", enabled: hasAccess("spot") },
  { label: "Predict", path: "/predict", enabled: true },
  { label: "Perpetuals", path: "/perpetuals", enabled: hasAccess("full") },
  { label: "Earn", path: "/earn", enabled: hasAccess("full") },
];

const SOCIAL_ITEMS: DropdownItem[] = [
  { label: "Leaderboard", path: "/leaderboard", enabled: hasAccess("spot") },
  { label: "Competitions", path: "/competitions", enabled: hasAccess("full") },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const socialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { isAdmin } = useAdminAccess();
  const isAppAdmin = useAppAdmin();
  const hasGenesisPass = useGenesisPass();
  const hasSpotAccess = isAppAdmin || hasAccess("spot");
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isHomePage = location.pathname === "/";
  const showWalletButton =
    !isHomePage ||
    status !== "disconnected" ||
    isZkLoggedIn ||
    isPasskeyUnlocked;

  useEffect(() => {
    setIsSocialOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        socialRef.current &&
        !socialRef.current.contains(event.target as Node)
      ) {
        setIsSocialOpen(false);
      }
    };
    if (isSocialOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSocialOpen]);

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    if (path === "/predict") {
      return location.pathname.startsWith("/predict");
    }
    if (path === "/social") {
      return (
        location.pathname.startsWith("/leaderboard") ||
        location.pathname.startsWith("/competitions")
      );
    }
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (isActive(path)) {
      e.preventDefault();
      navigate(path, { state: { key: Date.now() }, replace: true });
    }
  };

  const toggleSocial = () => {
    setIsSocialOpen((prev) => !prev);
  };

  return (
    <header className="border-b border-theme-border px-3 sm:px-4 md:px-6 py-3 md:py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Link
          to="/"
          className="hover:opacity-80 transition-opacity flex items-center gap-2"
        >
          <h1 className="text-xl md:text-2xl font-brand tracking-wider text-pd0 dark:text-white">
            PADO
          </h1>
          <span className="hidden sm:inline-flex self-center px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-pd1/10 text-pd1 border border-pd1/40 dark:bg-pd3/20 dark:text-pd4 dark:border-pd3/50 rounded">
            Nasun Devnet
          </span>
        </Link>

        <nav className="hidden md:flex order-last w-full xl:order-none xl:w-auto items-center justify-center xl:justify-start gap-1 pb-1 xl:pb-0">
          {NAV_ITEMS.map((item) => {
            const enabled = item.enabled || isAppAdmin;
            return enabled ? (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => handleNavClick(e, item.path)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-all border border-transparent ${
                  isActive(item.path)
                    ? "text-theme-text-primary bg-theme-bg-tertiary border-theme-border font-bold shadow-sm"
                    : "text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary hover:border-theme-border"
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <div
                key={item.path}
                className="group/nav relative px-3 py-2 text-sm font-medium rounded-md text-theme-text-secondary cursor-not-allowed inline-flex items-center gap-1 border border-transparent"
              >
                {item.label}
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-theme-bg-tertiary text-theme-text-secondary text-xs rounded opacity-0 group-hover/nav:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg border border-theme-border z-50">
                  Coming Soon
                </div>
              </div>
            );
          })}

          <div className="relative" ref={socialRef}>
            <button
              onClick={toggleSocial}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-all border border-transparent flex items-center gap-1 ${
                isActive("/social")
                  ? "text-theme-text-primary bg-theme-bg-tertiary border-theme-border font-bold shadow-sm"
                  : "text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary hover:border-theme-border"
              }`}
            >
              Social
              <svg
                className={`w-3 h-3 transition-transform ${isSocialOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isSocialOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 overflow-hidden">
                {SOCIAL_ITEMS.map((item) => {
                  const enabled = item.enabled || isAppAdmin;
                  return enabled ? (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsSocialOpen(false)}
                      className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                        isActive(item.path)
                          ? "text-theme-text-primary bg-theme-bg-tertiary font-bold"
                          : "text-theme-text-primary hover:bg-theme-bg-tertiary"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      key={item.path}
                      className="block px-4 py-2.5 text-sm font-medium text-theme-text-muted/40 cursor-not-allowed"
                    >
                      {item.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {hasSpotAccess ? (
            <Link
              to="/portfolio"
              onClick={(e) => handleNavClick(e, "/portfolio")}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-all border border-transparent ${
                isActive("/portfolio")
                  ? "text-theme-text-primary bg-theme-bg-tertiary border-theme-border font-bold shadow-sm"
                  : "text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary hover:border-theme-border"
              }`}
            >
              Portfolio
            </Link>
          ) : (
            <span className="px-3 py-2 text-sm font-medium rounded-md text-theme-text-muted cursor-not-allowed border border-transparent">
              Portfolio
            </span>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              className={`px-3 py-2 text-sm font-medium rounded-md transition-all border border-transparent ${
                isActive("/admin")
                  ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/20 font-bold"
                  : "text-yellow-600 hover:bg-yellow-500/5 hover:border-yellow-500/20"
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          {hasSpotAccess && <HeaderNetValue />}
          {hasGenesisPass && <GenesisPassBadge className="hidden sm:inline-flex" />}
          {showWalletButton && (
            <WalletConnect addressStartChars={isMobile ? 0 : 2} addressEndChars={3} />
          )}
        </div>
      </div>
    </header>
  );
}
