// DesktopNav.tsx

import { Link, useLocation } from "react-router-dom";
import { NavItem } from "../../types/routes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { useActiveState } from "../../hooks/useActiveState";
import { DESKTOP_NAVIGATION_STYLES } from "../../utils/navigationStyles";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type Props = {
  navItems: NavItem[];
};

export default function DesktopNav({ navItems }: Props) {
  const { getDesktopStyles } = useActiveState();
  const desktopStyles = getDesktopStyles();
  const location = useLocation();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (location.pathname === path) {
      e.preventDefault();
      // URL에 파라미터가 있으면 깨끗한 경로로 이동
      if (location.search) {
        window.location.href = path;
      } else {
        // 파라미터가 없으면 리로드
        window.location.reload();
      }
    }
  };

  return (
    <div className="hidden lg:flex flex-1 items-center justify-around gap-1 lg:gap-3 2xl:gap-6">
      {navItems.map((item) => (
        <div key={item.name}>
          {item.subMenu ? (
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button className={desktopStyles.parentButton(item)}>
                  <span>{item.name}</span>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="text-xs transition-transform group-data-[state=open]:rotate-180"
                  />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-56  bg-nasun-white/70 backdrop-blur-md rounded-lg shadow-lg border border-nasun-black/20 p-1 z-[70]"
                  align="start"
                  sideOffset={5}
                >
                  {item.subMenu.map((subItem) =>
                    subItem.subMenu ? (
                      // 3단계 중첩 메뉴 - 인라인 렌더링 (플라이아웃 대신)
                      <div key={subItem.name}>
                        {/* 부모 항목 (GEN SOL) - 클릭 불가능한 라벨 */}
                        <div className={DESKTOP_NAVIGATION_STYLES.subMenuHeader.base}>
                          <span>{subItem.name}</span>
                        </div>

                        {/* 인라인 하위 메뉴 (항상 표시, 왼쪽 border-l) */}
                        <div
                          className={`${DESKTOP_NAVIGATION_STYLES.nestedSubMenuWrapper.base} mb-2`}
                        >
                          {subItem.subMenu.map((nestedItem) => (
                            <DropdownMenu.Item
                              key={nestedItem.name}
                              asChild
                              disabled={nestedItem.disabled}
                            >
                              {nestedItem.disabled ? (
                                <span
                                  className={`${desktopStyles.nestedSubMenuItem(
                                    nestedItem
                                  )} cursor-not-allowed opacity-50`}
                                >
                                  <span>{nestedItem.name}</span>
                                </span>
                              ) : (
                                <Link
                                  to={nestedItem.path}
                                  onClick={(e) => handleLinkClick(e, nestedItem.path)}
                                  className={desktopStyles.nestedSubMenuItem(nestedItem)}
                                >
                                  <span>{nestedItem.name}</span>
                                </Link>
                              )}
                            </DropdownMenu.Item>
                          ))}
                        </div>
                      </div>
                    ) : (
                      // 2단계 메뉴 (기존 방식)
                      <DropdownMenu.Item key={subItem.name} asChild disabled={subItem.disabled}>
                        {subItem.disabled ? (
                          <span
                            className={`${desktopStyles.subMenuItem(
                              subItem
                            )} cursor-not-allowed opacity-50`}
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
                            href={subItem.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={desktopStyles.subMenuItem(subItem)}
                          >
                            <span className="flex items-center gap-2">
                              {subItem.name}
                              <FontAwesomeIcon
                                icon={faArrowUpRightFromSquare}
                                className="text-xs opacity-70"
                              />
                            </span>
                          </a>
                        ) : (
                          <Link
                            to={subItem.path}
                            onClick={(e) => handleLinkClick(e, subItem.path)}
                            className={desktopStyles.subMenuItem(subItem)}
                          >
                            <span>{subItem.name}</span>
                          </Link>
                        )}
                      </DropdownMenu.Item>
                    )
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <Link
              to={item.path}
              onClick={(e) => handleLinkClick(e, item.path)}
              className={desktopStyles.mainLink(item)}
            >
              <span>{item.name}</span>
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
