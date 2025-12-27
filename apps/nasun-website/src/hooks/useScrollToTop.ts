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
    console.log("🔄 [useScrollToTop] pathname 체크:", {
      prev: prevPathnameRef.current,
      current: location.pathname,
      search: location.search,
      willScroll: prevPathnameRef.current !== location.pathname
    });

    // pathname 값이 실제로 변경되었을 때만 스크롤
    // (객체 참조가 아닌 값 비교)
    if (prevPathnameRef.current !== location.pathname) {
      console.log("⬆️ [useScrollToTop] 페이지 상단으로 스크롤 실행 (pathname 변경)");
      window.scrollTo({
        top: 0,
        behavior: "auto",
      });
      prevPathnameRef.current = location.pathname;
    }
  }, [location.pathname]);

  // 초기 마운트 시에도 스크롤을 최상단으로 이동 (페이지 리로드 지원)
  useEffect(() => {
    console.log("🎬 [useScrollToTop] 초기 마운트 - 페이지 상단으로 스크롤");
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, []);
}
