// components/navbar/Navbar.tsx

import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { getNavItemsV2 } from "../../config/routesConfig";
import { NavItem } from "../../types/routes";
import LoginButton from "./LoginButton";
import WalletButton from "./WalletButton";
import WalletDisconnectModal from "./WalletDisconnectModal";
import { NavStandingBadge } from "./NavStandingBadge";
import DesktopNav from "./DesktopNav";
import MobileNav from "./MobileNav";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleUser,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import * as Tooltip from "@radix-ui/react-tooltip";

import { useAuth } from "@/features/auth";
import { useAdminAuth } from "@/features/admin/hooks/useAdminAuth";

export default function Navbar() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { isAdmin } = useAdminAuth();
  const [isMenuOpen, setIsMenuOpen] = useState<Record<string, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = useMemo(() => getNavItemsV2(t), [t]);

  // 현재 활성화된 서브페이지의 부모 메뉴를 찾아서 자동으로 열기
  const activeParentMenus = useMemo(() => {
    const result: Record<string, boolean> = {};

    navItems.forEach((item) => {
      if (item.subMenu) {
        // 서브메뉴 중에 현재 경로와 일치하는 항목이 있는지 확인
        const hasActiveSubItem = item.subMenu.some(
          (subItem) =>
            location.pathname === subItem.path ||
            (subItem.path !== "/" &&
              location.pathname.startsWith(subItem.path)),
        );

        if (hasActiveSubItem) {
          result[item.name] = true;
        }
      }
    });

    return result;
  }, [location.pathname, navItems]);

  useEffect(() => {
    setIsMenuOpen(activeParentMenus);
  }, [activeParentMenus]);

  const toggleSubMenu = useCallback((menuName: string) => {
    setIsMenuOpen((prev) => ({
      ...prev,
      [menuName]: !prev[menuName],
    }));
  }, []);

  const closeAllMenus = useCallback(() => {
    setIsMenuOpen({});
    setMobileMenuOpen(false);
  }, []);

  // Note: DesktopNav now uses Radix UI DropdownMenu internally
  // isMenuOpen/toggleSubMenu/closeAllMenus are only needed for MobileNav

  // Authentication is now handled by AuthContext

  const handleHomeClick = (e: React.MouseEvent) => {
    if (location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <nav
      aria-label="Main navigation"
      className="fixed top-0 left-0 right-0 z-[60] h-[50px] mx-auto bg-nasun-white border-b border-nasun-black/10 shadow-sm flex items-center justify-center  pr-4 min-[640px]:px-4 lg:px-8"
    >
      {/* Inner container: max-width 1920px */}
      <div className="w-full max-w-9xl flex items-center gap-2">
        {/* Mobile + Tablet: hamburger (left of wordmark, hidden on desktop) */}
        <div className="flex lg:hidden">
          <MobileNav
            navItems={navItems}
            isMenuOpen={isMenuOpen}
            toggleSubMenu={toggleSubMenu}
            closeAllMenus={closeAllMenus}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
            isAdmin={isAdmin}
          />
        </div>

        {/* Logo area */}
        <Link
          to="/"
          onClick={handleHomeClick}
          className="flex items-center gap-2 flex-shrink-0 mr-4 lg:mr-8"
        >
          {/* Symbol: desktop only */}
          <img
            src="/nasun_symbol_black.svg"
            alt="NASUN"
            className="hidden lg:block h-7 w-7 translate-y-[2px]"
          />
          {/* Wordmark: desktop + tablet, hidden on mobile */}
          <span className="px-4 hidden min-[640px]:block !font-changeling font-bold text-nasun-black text-2xl tracking-wider">
            NASUN
          </span>
        </Link>
        {/* Desktop nav menu */}
        <DesktopNav navItems={navItems} />

        {/* Actions: right-aligned on all breakpoints */}
        <div className="ml-auto flex gap-6 lg:gap-7 items-center justify-end flex-shrink-0">
          {isAdmin && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => navigate("/admin")}
                  className={`rounded-3xl cursor-pointer hover:opacity-70 transition-all flex items-center justify-center ${location.pathname.startsWith("/admin") ? "text-nasun-nw2" : "text-nasun-black"}`}
                  aria-label="Admin"
                >
                  <FontAwesomeIcon
                    icon={faShieldHalved}
                    className="text-xl lg:text-2xl"
                  />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content
                side="bottom"
                align="center"
                sideOffset={5}
                className="max-w-[150px] px-2 py-1 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg"
              >
                Admin
              </Tooltip.Content>
            </Tooltip.Root>
          )}

          {isAuthenticated && user && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => {
                    if (location.pathname === "/my-account") {
                      window.scrollTo(0, 0);
                      window.location.reload();
                    } else {
                      navigate("/my-account");
                    }
                  }}
                  className={`rounded-3xl cursor-pointer hover:opacity-70 transition-all flex items-center justify-center ${location.pathname === "/my-account" ? "text-nasun-nw2" : "text-nasun-black"}`}
                  aria-label="유저 프로필"
                >
                  <FontAwesomeIcon
                    icon={faCircleUser}
                    className="text-xl lg:text-2xl"
                  />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content
                side="bottom"
                align="center"
                sideOffset={5}
                className="max-w-[150px] px-2 py-1 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg"
              >
                {t("myAccount")}
              </Tooltip.Content>
            </Tooltip.Root>
          )}

          {isAuthenticated && user?.walletAddress && (
            <NavStandingBadge walletAddress={user.walletAddress} />
          )}
          {isAuthenticated && user && <WalletButton />}
          <LoginButton />
          {isAuthenticated && user && <WalletDisconnectModal />}
        </div>
      </div>
    </nav>
  );
}
