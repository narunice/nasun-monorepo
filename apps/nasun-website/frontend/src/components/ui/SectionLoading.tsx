/**
 * SectionLoading Component
 *
 * @description
 * Suspense fallback 및 섹션 로딩용 표준 컴포넌트
 * 원형 스피너 + 텍스트로 일관된 로딩 UI 제공
 *
 * @author Claude Code
 * @date 2025-10-27
 */

import React from "react";
import { SectionLayout } from "../layout/SectionLayout";
import { useTranslation } from "react-i18next";
import { Spinner } from "./Spinner";

interface SectionLoadingProps {
  /** 커스텀 로딩 메시지 */
  message?: string;
  /** 추가 CSS 클래스 */
  className?: string;
  /** SectionLayout 래퍼 사용 여부 (default: true) */
  showLayout?: boolean;
  /** h-screen 높이로 표시 - 페이지 Suspense fallback용 (default: false) */
  fullScreen?: boolean;
}

/**
 * SectionLoading
 *
 * @example
 * // 페이지 Suspense fallback (h-screen, layout shift 방지)
 * <Suspense fallback={<SectionLoading fullScreen />}>
 *   <LazyPageContent />
 * </Suspense>
 *
 * @example
 * // 섹션 Suspense fallback (SectionLayout 포함)
 * <Suspense fallback={<SectionLoading />}>
 *   <Component />
 * </Suspense>
 *
 * @example
 * // 컴포넌트 내부 로딩 (SectionLayout 제외)
 * {isLoading && <SectionLoading showLayout={false} />}
 */
export const SectionLoading: React.FC<SectionLoadingProps> = ({
  message,
  className = "",
  showLayout = true,
  fullScreen = false,
}) => {
  const { t } = useTranslation("common");

  const containerClass = fullScreen
    ? "h-screen flex items-center justify-center bg-nasun-black"
    : "text-center py-8";

  const content = (
    <div className={`${containerClass} ${className}`}>
      <div className="flex justify-center items-center">
        <Spinner size="lg" />
        <span className="ml-3 text-base text-nasun-white">
          {message || t("info.loading")}
        </span>
      </div>
    </div>
  );

  if (fullScreen) {
    return content;
  }

  return showLayout ? <SectionLayout>{content}</SectionLayout> : content;
};
