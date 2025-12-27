import { ReactNode } from "react"

interface ScrollSnapSectionProps {
  children: ReactNode
  className?: string
  allowTallContent?: boolean
}

/**
 * ScrollSnapSection 컴포넌트
 *
 * 풀페이지 스크롤 스냅 섹션 래퍼
 * - 데스크톱(768px+): 전체 화면(100vh) 또는 콘텐츠 높이
 * - 모바일(<768px): 자동 높이 (min-height: 100vh)
 *
 * 기능:
 * - 섹션별 스크롤 스냅 타겟
 * - scroll-snap-section 클래스로 식별
 * - allowTallContent: 100vh를 초과하는 긴 콘텐츠 허용
 */
export function ScrollSnapSection({
  children,
  className = "",
  allowTallContent = false,
}: ScrollSnapSectionProps) {
  return (
    <section
      className={`
        scroll-snap-section
        ${allowTallContent ? "min-h-screen" : "md:h-screen min-h-screen"}
        isolation-isolate
        overflow-clip
        ${className}
      `}
    >
      {children}
    </section>
  )
}
