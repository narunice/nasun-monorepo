import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

interface PageLoadingContextType {
  isPageReady: boolean;
  setIsPageReady: (ready: boolean) => void;
  clearTimer: () => void;
}

const PageLoadingContext = createContext<PageLoadingContextType | undefined>(undefined);

export const PageLoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPageReady, setIsPageReady] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();

  // 타이머를 수동으로 중단할 수 있는 함수
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 경로 변경 감지 - 비디오 hero 페이지로 이동 시 즉시 Footer 숨김
  useEffect(() => {
    // 비디오 hero 섹션이 있는 페이지들: Footer를 비디오 로딩 완료 후에만 표시
    const isPageWithVideoHero =
      location.pathname === "/" ||
      location.pathname === "/home" ||
      location.pathname === "/protocol/network" ||
      location.pathname === "/finance/pado";

    if (isPageWithVideoHero) {
      // 비디오 hero 페이지: 즉시 false로 설정, 타이머 중단
      clearTimer();
      setIsPageReady(false);
    } else {
      // 다른 페이지: 1000ms 후 Footer 표시 (페이지 콘텐츠 로딩 대기)
      clearTimer(); // 기존 타이머 취소
      timerRef.current = setTimeout(() => {
        setIsPageReady(true);
        timerRef.current = null;
      }, 1000);
    }

    return () => clearTimer();
  }, [location.pathname, clearTimer]);

  return (
    <PageLoadingContext.Provider value={{ isPageReady, setIsPageReady, clearTimer }}>
      {children}
    </PageLoadingContext.Provider>
  );
};

// 하위 호환성을 위한 alias
export const HomePageLoadingProvider = PageLoadingProvider;

export const usePageLoading = () => {
  const context = useContext(PageLoadingContext);
  if (context === undefined) {
    throw new Error("usePageLoading must be used within PageLoadingProvider");
  }
  return context;
};

// 하위 호환성을 위한 alias
export const useHomePageLoading = usePageLoading;
