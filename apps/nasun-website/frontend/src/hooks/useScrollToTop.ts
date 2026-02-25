// src/hooks/useScrollToTop.ts
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * 페이지 이동 및 페이지 리로드 시 자동으로 스크롤을 최상단으로 이동시키는 훅
 *
 * pathname 값이 실제로 변경되었을 때만 스크롤하여,
 * search params만 변경되는 경우 스크롤을 유지합니다.
 * (예: /leaderboard?user=X 같은 사용자 검색 기능)
 */
export default function useScrollToTop() {
  const location = useLocation();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevPathnameRef.current !== location.pathname) {
      window.scrollTo({ top: 0, behavior: "instant" });
      prevPathnameRef.current = location.pathname;
    }
  }, [location.pathname]);

  // Scroll to top on initial mount (page reload support)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
}
