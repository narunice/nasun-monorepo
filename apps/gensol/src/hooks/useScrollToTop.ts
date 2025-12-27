// src/hooks/useScrollToTop.ts
import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * 페이지 이동 시 자동으로 스크롤을 최상단으로 이동시키는 훅
 */
export default function useScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // 부드러운 스크롤 적용시 "smooth" (필요시 'auto'로 변경 가능)
    window.scrollTo({
      top: 0,
      behavior: "auto",
    })
  }, [pathname])
}
