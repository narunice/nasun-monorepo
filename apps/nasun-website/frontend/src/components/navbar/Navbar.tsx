// components/navbar/Navbar.tsx

import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { getNavItemsV2 } from "../../config/routesConfig";
import { NavItem } from "../../types/routes";
import LoginButton from "./LoginButton";
import WalletButton from "./WalletButton";
import DesktopNav from "./DesktopNav";
import MobileNav from "./MobileNav";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleUser } from "@fortawesome/free-solid-svg-icons";
import * as Tooltip from "@radix-ui/react-tooltip";

import { useAuth } from "@/features/auth";

export default function Navbar() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
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
            (subItem.path !== "/" && location.pathname.startsWith(subItem.path)),
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

  return (
    <nav
      aria-label="Main navigation"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-8xl px-0 lg:px-4 flex gap-6 items-stretch"
    >
      {/* 데스크탑: 심볼 박스 (가장 왼쪽, 독립적) */}
      <Link
        to="/"
        className="hidden lg:block flex-shrink-0 w-14 h-14"
        onClick={(e) => {
          // 현재 홈페이지에 있으면 상단으로 스크롤
          if (location.pathname === "/") {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
          // 다른 페이지에서는 Link의 기본 동작 (홈으로 이동)
        }}
      >
        <div className="flex items-center justify-center w-full h-full rounded-full bg-nasun-white transition-all shadow-lg">
          <img
            src="/nasun_symbol_black.svg"
            alt="NASUN"
            className="h-8 w-8 transition-all translate-y-[2px]"
          />
        </div>
      </Link>

      {/* 메인 navbar 박스 */}
      <div className="flex-1 min-w-0 h-14 bg-nasun-white rounded-3xl shadow-lg transition-all flex pl-5 lg:pl-8 pr-5 lg:pr-8 gap-2 lg:gap-4 2xl:gap-8 justify-between items-center text-center text-base ">
        {/* 모바일: 햄버거 메뉴 + 워드마크 */}
        <div className="flex items-center gap-4 lg:hidden">
          <MobileNav
            navItems={navItems}
            isMenuOpen={isMenuOpen}
            toggleSubMenu={toggleSubMenu}
            closeAllMenus={closeAllMenus}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
          <Link
            to="/"
            onClick={(e) => {
              // 현재 홈페이지에 있으면 상단으로 스크롤
              if (location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
              // 다른 페이지에서는 Link의 기본 동작 (홈으로 이동)
            }}
          >
            <span className="hidden min-[440px]:block !font-changeling font-bold text-nasun-black text-xl md:text-2xl tracking-wider transition-all">
              NASUN
            </span>
          </Link>
        </div>

        {/* 데스크탑 메뉴 */}
        <DesktopNav navItems={navItems} />

        {/* 공통 기능들 */}
        <div className="flex gap-6 lg:gap-7 min-w-36 items-center justify-end flex-shrink-0">
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
                  <FontAwesomeIcon icon={faCircleUser} className="text-xl lg:text-2xl" />
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

          {isAuthenticated && user && <WalletButton />}
          <LoginButton />
        </div>
      </div>
    </nav>
  );
}
