import { ReactNode } from "react";

interface ScrollSnapSectionProps {
  children: ReactNode;
  className?: string;
  allowTallContent?: boolean;
  /** 1024px 이하에서 스냅 비활성화 (기본값: false) */
  disableSnapBelowLg?: boolean;
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
 *   (ScrollSnapContainer의 조건부 스냅 전략이 자동 활성화)
 * - disableSnapBelowLg: 1024px 이하에서 스냅 비활성화
 */
export function ScrollSnapSection({
  children,
  className = "",
  allowTallContent = false,
  disableSnapBelowLg = false,
}: ScrollSnapSectionProps) {
  return (
    <section
      className={`
        scroll-snap-section
        /* 조건부 높이: navbar(3.5rem) 제외한 viewport */
        ${allowTallContent ? 'min-h-[calc(100vh-50px)]' : 'md:h-[calc(100vh-50px)] min-h-[calc(100vh-50px)]'}
        /* Isolation: 새로운 Stacking Context 생성 (z-index 충돌 방지) */
        isolation-isolate
        /* tall 섹션은 콘텐츠 높이로 자라야 하므로 overflow-clip 제거 */
        ${allowTallContent ? '' : 'overflow-clip'}
        ${className}
      `}
      {...(disableSnapBelowLg && { 'data-disable-snap-below-lg': 'true' })}
    >
      {children}
    </section>
  );
}
