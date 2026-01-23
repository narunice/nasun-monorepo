// src/components/navbar/MobileNav.tsx

import { Link, useLocation } from "react-router-dom";
import { NavItem, SubMenuItem } from "../../types/routes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faBars, faXmark, faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { useActiveState } from "../../hooks/useActiveState";
import { MOBILE_NAVIGATION_STYLES } from "../../utils/navigationStyles";
import { useEffect } from "react";

type Props = {
  navItems: NavItem[];
  isMenuOpen: Record<string, boolean>;
  toggleSubMenu: (menuName: string) => void;
  closeAllMenus: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (state: boolean) => void;
};

export default function MobileNav({
  navItems,
  isMenuOpen,
  toggleSubMenu,
  closeAllMenus,
  mobileMenuOpen,
  setMobileMenuOpen,
}: Props) {
  const { getMobileStyles, isActive } = useActiveState();
  const mobileStyles = getMobileStyles();
  const location = useLocation();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (location.pathname === path) {
      e.preventDefault();
      closeAllMenus();
      // URL에 파라미터가 있으면 깨끗한 경로로 이동
      if (location.search) {
        window.location.href = path;
      } else {
        // 파라미터가 없으면 리로드
        window.location.reload();
      }
    } else {
      closeAllMenus();
    }
  };

  /**
   * 모바일 메뉴 열릴 때 layout shift 방지 해결책
   *
   * 문제: Radix Dialog의 기본 modal 동작 시 스크롤바가 사라지면서
   * 페이지 본문이 좌우로 미세하게 이동하는 현상 발생
   *
   * 해결: modal={false} + 수동 스크롤 제어
   * - Radix의 복잡한 스크롤바 보정 로직 우회
   * - scrollbar-gutter: stable (index.css)로 스크롤바 공간 예약
   * - JavaScript로 직접 overflow: hidden 관리하여 배경 스크롤만 차단
   * - 레이아웃 변화 없이 깔끔한 UX 구현
   */
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    // 컴포넌트 언마운트 시 정리
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);
  return (
    <Dialog.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <Dialog.Trigger asChild>
        <button
          className="p-2 text-nasun-black hover:opacity-70 transition-all flex items-center justify-center"
          aria-label="Open Menu"
        >
          <FontAwesomeIcon icon={faBars} className="text-lg " />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />

        <Dialog.Content className="fixed top-0 left-0 w-3/5 h-full pt-5 pb-10 px-6 z-[65] bg-nasun-white rounded-r-lg shadow-lg">
          <Dialog.Title className="sr-only">Mobile Menu</Dialog.Title>
        <Dialog.Description className="sr-only">
          사이트 내비게이션 링크를 탐색할 수 있는 패널입니다.
        </Dialog.Description>

        <div className="flex justify-between items-center mb-8">
          <Link to="/" onClick={(e) => handleLinkClick(e, "/")} className="flex items-center">
            {/* 흰색 심볼 */}
            <img
              src="/nasun_symbol_white.svg"
              alt="NASUN"
              className="h-8 w-auto transition-all dark:hidden"
            />
            {/* 검은색 심볼 */}
            <img
              src="/nasun_symbol_black.svg"
              alt="NASUN"
              className="h-8 w-auto transition-all block"
            />
          </Link>
          <button
            onClick={closeAllMenus}
            className="p-2 text-nasun-black hover:opacity-70 transition-all"
            aria-label="Close Menu"
          >
            <FontAwesomeIcon icon={faXmark} className="text-lg" />
          </button>
        </div>

        <nav className="flex flex-col items-start">
          {navItems.map((item, index) => {
            // 메뉴 항목 간격 설정
            const getMarginClass = () => {
              if (index === 0) return ""; // 첫 번째 항목은 마진 없음
              return "mt-1"; // 나머지 항목들은 일정한 간격
            };

            return (
              <div key={item.name} className={getMarginClass()}>
                {item.subMenu ? (
                  <div className="space-y-0.5">
                    {/* 1) 부모 메뉴: 클릭하면 토글만 */}
                    <button
                      onClick={() => toggleSubMenu(item.name)}
                      className={`flex items-center justify-between gap-2 w-full text-base py-1.5 px-2 transition-all rounded-xl text-nasun-black ${
                        isActive(item) ? "bg-nasun-c4/20" : "hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      {item.name}
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={`text-sm transition-transform ${
                          isMenuOpen[item.name] ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* 서브메뉴 */}
                    {isMenuOpen[item.name] && (
                      <div className="ml-4 border-l-2 border-nasun-c4/50 space-y-0.5">
                        {item.subMenu.map((subItem: SubMenuItem) =>
                          subItem.subMenu ? (
                            // 3단계 중첩: 인라인 렌더링 (토글 없이 항상 표시)
                            <div key={subItem.name}>
                              {/* 부모 항목 (GEN SOL) - 클릭 불가능한 라벨 */}
                              <div className={MOBILE_NAVIGATION_STYLES.subMenuHeader.base}>
                                <span>{subItem.name}</span>
                              </div>

                              {/* 인라인 하위 메뉴 (항상 표시, 왼쪽 border-l) */}
                              <div className={`${MOBILE_NAVIGATION_STYLES.nestedSubMenuWrapper.base} mb-2 space-y-1`}>
                                {subItem.subMenu.map((nestedItem: SubMenuItem) =>
                                  nestedItem.disabled ? (
                                    <span
                                      key={nestedItem.name}
                                      className={`${mobileStyles.nestedSubMenuItem(nestedItem)} opacity-50 cursor-not-allowed`}
                                    >
                                      <span>{nestedItem.name}</span>
                                    </span>
                                  ) : (
                                    <Link
                                      key={nestedItem.name}
                                      to={nestedItem.path}
                                      onClick={(e) => handleLinkClick(e, nestedItem.path)}
                                      className={mobileStyles.nestedSubMenuItem(nestedItem)}
                                    >
                                      {nestedItem.name}
                                    </Link>
                                  )
                                )}
                              </div>
                            </div>
                          ) : (
                            // 2단계 메뉴 (기존 방식)
                            subItem.disabled ? (
                              <span
                                key={subItem.name}
                                className="block py-1.5 px-3 text-left rounded-xl text-nasun-black opacity-50 cursor-not-allowed"
                              >
                                <span className="flex items-center gap-2">
                                  {subItem.name}
                                  {subItem.external && (
                                    <FontAwesomeIcon
                                      icon={faArrowUpRightFromSquare}
                                      className="text-xs opacity-70"
                                    />
                                  )}
                                </span>
                              </span>
                            ) : subItem.external ? (
                              <a
                                key={subItem.name}
                                href={subItem.path}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => closeAllMenus()}
                                className="block py-1.5 px-3 transition-all text-left rounded-xl text-nasun-black hover:bg-slate-800/70 hover:text-white"
                              >
                                <span className="flex items-center gap-2">
                                  {subItem.name}
                                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs opacity-70" />
                                </span>
                              </a>
                            ) : (
                              <Link
                                key={subItem.name}
                                to={subItem.path}
                                onClick={(e) => handleLinkClick(e, subItem.path)}
                                className={`block py-1.5 px-3 transition-all text-left rounded-xl text-nasun-black ${
                                  isActive(subItem) ? "bg-nasun-c4/20" : "hover:bg-slate-800/70 hover:text-white"
                                }`}
                              >
                                {subItem.name}
                              </Link>
                            )
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    to={item.path}
                    onClick={(e) => handleLinkClick(e, item.path)}
                    className={`block text-base py-1.5 px-2 transition-all text-left rounded-xl text-nasun-black ${
                      isActive(item) ? "bg-nasun-c4/20" : "hover:bg-slate-800/70 hover:text-white"
                    }`}
                  >
                    {item.name}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}
