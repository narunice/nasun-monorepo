// src/hooks/useActiveState.ts

import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { NavItem, SubMenuItem } from "../types/routes";
import { DESKTOP_NAVIGATION_STYLES, MOBILE_NAVIGATION_STYLES } from "../utils/navigationStyles";

/**
 * 네비게이션 항목의 active 상태를 판단하는 통합 훅
 * Desktop과 Mobile 네비게이션에서 일관된 active state 로직 제공
 */
export const useActiveState = () => {
  const location = useLocation();

  /**
   * 주어진 네비게이션 항목이 현재 경로와 일치하는지 확인
   * @param item - NavItem 또는 SubMenuItem
   * @returns boolean - active 상태 여부
   */
  const isActive = useCallback(
    (item: NavItem | SubMenuItem) => {
      // 정확한 경로 매칭
      if (location.pathname === item.path) {
        return true;
      }

      // 리프 항목 (하위 메뉴가 없는 항목)은 정확한 경로 매칭만 사용
      // 이렇게 하면 /ip/gensol/spectra에서 Main(/ip/gensol)이 active로 표시되지 않음
      if (!('subMenu' in item) || !item.subMenu) {
        return false;
      }

      // 하위 경로 매칭 (부모 메뉴 항목에만 적용)
      // 예: /vision이 item.path이고 현재 경로가 /vision/nasunplan인 경우
      if (item.path !== "/" && location.pathname.startsWith(item.path)) {
        // 경로가 정확히 구분되는지 확인 (예: /vision과 /visionX 구분)
        const nextChar = location.pathname[item.path.length];
        return nextChar === "/" || nextChar === undefined;
      }

      return false;
    },
    [location.pathname]
  );

  /**
   * 서브메뉴를 가진 부모 항목의 active 상태 확인
   * 서브메뉴 중 하나라도 active이면 부모도 active
   * @param item - 서브메뉴를 가진 NavItem
   * @returns boolean - 부모 또는 자식 중 하나라도 active인지
   */
  const isParentActive = useCallback(
    (item: NavItem) => {
      // 부모 자체가 active인 경우
      if (isActive(item)) {
        return true;
      }

      // 서브메뉴 중 하나라도 active인 경우 (hidden 항목은 backward-compat
      // 용도라 부모 메뉴 활성화에 기여하지 않음. 같은 path를 다른 visible
      // 부모 아래로 옮긴 경우 두 부모가 동시에 active로 잡히는 사고 방지)
      if (item.subMenu) {
        return item.subMenu.some(
          (subItem) => !subItem.hidden && isActive(subItem),
        );
      }

      return false;
    },
    [isActive]
  );

  /**
   * active 상태에 따른 CSS 클래스 반환
   * @param item - NavItem 또는 SubMenuItem
   * @param customClasses - 추가 커스텀 클래스 설정
   * @returns string - 적용할 CSS 클래스
   */
  const getActiveClasses = useCallback(
    (
      item: NavItem | SubMenuItem,
      customClasses?: {
        active?: string;
        inactive?: string;
        base?: string;
      }
    ) => {
      const baseClasses = customClasses?.base || "transition-all";
      const activeClasses = customClasses?.active || "text-nasun-black font-medium";
      const inactiveClasses = customClasses?.inactive || "hover:text-nasun-white hover:text-nasun-black";

      return `${baseClasses} ${isActive(item) ? activeClasses : inactiveClasses}`;
    },
    [isActive]
  );

  /**
   * 서브메뉴 항목을 위한 CSS 클래스 반환
   * @param subItem - SubMenuItem
   * @returns string - 서브메뉴용 CSS 클래스
   */
  const getSubMenuActiveClasses = useCallback(
    (subItem: SubMenuItem) => {
      const styles = DESKTOP_NAVIGATION_STYLES.subMenuItem;
      return getActiveClasses(subItem, styles);
    },
    [getActiveClasses]
  );

  /**
   * 데스크탑 네비게이션을 위한 스타일 헬퍼들
   */
  const getDesktopStyles = useCallback(
    () => ({
      mainLink: (item: NavItem | SubMenuItem) =>
        getActiveClasses(item, DESKTOP_NAVIGATION_STYLES.mainLink),

      parentButton: (item: NavItem) =>
        getActiveClasses(item, DESKTOP_NAVIGATION_STYLES.parentButton),

      subMenuItem: (subItem: SubMenuItem) =>
        getActiveClasses(subItem, DESKTOP_NAVIGATION_STYLES.subMenuItem),

      nestedSubMenuItem: (subItem: SubMenuItem) =>
        getActiveClasses(subItem, DESKTOP_NAVIGATION_STYLES.nestedSubMenuItem),
    }),
    [getActiveClasses]
  );

  /**
   * 모바일 네비게이션을 위한 스타일 헬퍼들
   */
  const getMobileStyles = useCallback(
    () => ({
      mainLink: (item: NavItem | SubMenuItem) =>
        getActiveClasses(item, MOBILE_NAVIGATION_STYLES.mainLink),

      parentButton: (item: NavItem) =>
        getActiveClasses(item, MOBILE_NAVIGATION_STYLES.parentButton),

      subMenuItem: (subItem: SubMenuItem) =>
        getActiveClasses(subItem, MOBILE_NAVIGATION_STYLES.subMenuItem),

      nestedSubMenuItem: (subItem: SubMenuItem) =>
        getActiveClasses(subItem, MOBILE_NAVIGATION_STYLES.nestedSubMenuItem),
    }),
    [getActiveClasses]
  );

  return {
    isActive,
    isParentActive,
    getActiveClasses,
    getSubMenuActiveClasses,
    getDesktopStyles,
    getMobileStyles,
    currentPath: location.pathname,
  };
};

export default useActiveState;
