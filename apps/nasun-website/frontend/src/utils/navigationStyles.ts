// src/utils/navigationStyles.ts

/**
 * 네비게이션 컴포넌트의 일관된 스타일링을 위한 유틸리티
 * Desktop과 Mobile 네비게이션에서 동일한 색상과 스타일 규칙 적용
 */

/**
 * 데스크탑 네비게이션을 위한 공통 스타일 클래스
 */
export const DESKTOP_NAVIGATION_STYLES = {
  // 메인 네비게이션 링크 (서브메뉴가 없는 항목)
  // 패딩을 base에 통일하여 active/inactive 전환 시 레이아웃 시프트 방지
  // whitespace-nowrap으로 메뉴 항목 줄바꿈 방지
  mainLink: {
    base: "transition-all text-base text-nasun-black !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none px-5 py-1.5 whitespace-nowrap",
    active: "bg-nasun-c4/20 rounded-2xl",
    inactive: "text-nasun-black hover:opacity-70",
  },

  // 서브메뉴를 가진 부모 버튼 (꺾쇠 아이콘이 있으므로 오른쪽 패딩 축소)
  // 패딩을 base에 통일하여 active/inactive 전환 시 레이아웃 시프트 방지
  // whitespace-nowrap으로 메뉴 항목 줄바꿈 방지
  parentButton: {
    base: "flex items-center gap-1 xl:gap-2 transition-all text-base text-nasun-black !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none pl-4 pr-2 xl:pl-5 xl:pr-3 py-1.5 whitespace-nowrap",
    active: "bg-nasun-c4/20 rounded-2xl",
    inactive: "text-nasun-black hover:opacity-70",
  },

  // 서브메뉴 드롭다운 항목
  subMenuItem: {
    base: "w-full px-4 py-2 transition-colors text-base rounded-lg !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none data-[highlighted]:bg-slate-500/40 data-[highlighted]:text-white data-[highlighted]:!outline-none flex items-center gap-2",
    active: "text-nasun-black bg-nasun-c4/20 rounded-2xl",
    inactive: "text-nasun-black hover:bg-slate-800/70 hover:text-white !border-none",
  },

  // 서브메뉴 헤더 (클릭 불가능한 라벨, 예: GEN SOL)
  subMenuHeader: {
    base: "w-full px-4 py-2 text-base text-nasun-black/90 cursor-default select-none",
  },

  // 중첩된 서브메뉴 항목 (인라인, 세로선 안쪽에 유지)
  nestedSubMenuItem: {
    base: "w-full pl-4 pr-4 py-1.5 transition-colors text-base rounded-lg !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none data-[highlighted]:bg-slate-500/40 data-[highlighted]:text-white data-[highlighted]:!outline-none flex items-center gap-2",
    active: "text-nasun-black bg-nasun-c4/20",
    inactive: "text-nasun-black/80 hover:bg-slate-800/70 hover:text-white",
  },

  // 중첩된 서브메뉴 wrapper (왼쪽 border-l 포함)
  nestedSubMenuWrapper: {
    base: "ml-4 border-l-2 border-nasun-c4/50",
  },
} as const;

/**
 * 모바일 네비게이션을 위한 공통 스타일 클래스
 */
export const MOBILE_NAVIGATION_STYLES = {
  // 메인 네비게이션 링크 (서브메뉴가 없는 항목)
  mainLink: {
    base: "block text-base py-1.5 px-2 transition-all text-left rounded-xl !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none",
    active: "bg-nasun-c4/20",
    inactive: "text-nasun-black hover:bg-slate-800/60",
  },

  // 서브메뉴를 가진 부모 버튼
  parentButton: {
    base: "flex items-center justify-between gap-2 w-full text-base py-1.5 px-2 transition-all rounded-xl !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none",
    active: "bg-nasun-c4/20",
    inactive: "text-nasun-black hover:bg-slate-800/60",
  },

  // 서브메뉴 항목 (들여쓰기된 항목)
  subMenuItem: {
    base: "block py-1.5 px-3 transition-all text-left rounded-xl !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none",
    active: "text-nasun-black bg-nasun-c4/20",
    inactive: "text-nasun-black hover:bg-slate-800/70 hover:text-white !border-none",
  },

  // 서브메뉴 헤더 (클릭 불가능한 라벨, 예: GEN SOL)
  subMenuHeader: {
    base: "block py-2 px-2 text-base text-nasun-black/90 cursor-default select-none",
  },

  // 중첩된 서브메뉴 항목 (인라인, 세로선 안쪽에 유지)
  nestedSubMenuItem: {
    base: "block w-full pl-3 pr-2 py-1.5 transition-all text-left rounded-lg !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 active:!outline-none",
    active: "text-nasun-black bg-nasun-c4/20",
    inactive: "text-nasun-black/80 hover:bg-slate-800/70 hover:text-white",
  },

  // 중첩된 서브메뉴 wrapper (왼쪽 border-l 포함)
  nestedSubMenuWrapper: {
    base: "ml-4 border-l-2 border-nasun-c4/50",
  },
} as const;
