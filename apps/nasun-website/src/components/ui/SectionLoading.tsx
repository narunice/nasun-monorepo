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

interface SectionLoadingProps {
  /** 커스텀 로딩 메시지 */
  message?: string;
  /** 추가 CSS 클래스 */
  className?: string;
  /** SectionLayout 래퍼 사용 여부 (default: true) */
  showLayout?: boolean;
}

/**
 * SectionLoading
 *
 * @example
 * // Suspense fallback (SectionLayout 포함)
 * <Suspense fallback={<SectionLoading />}>
 *   <Component />
 * </Suspense>
 *
 * @example
 * // 컴포넌트 내부 로딩 (SectionLayout 제외)
 * {isLoading && <SectionLoading showLayout={false} />}
 *
 * @example
 * // 커스텀 메시지
 * <SectionLoading message="데이터를 불러오는 중..." />
 */
export const SectionLoading: React.FC<SectionLoadingProps> = ({
  message,
  className = "",
  showLayout = true,
}) => {
  const { t } = useTranslation("common");

  const content = (
    <div className={`text-center py-8 ${className}`}>
      <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-100"></div>
        <span className="ml-3 text-base text-nasun-white">
          {message || t("info.loading")}
        </span>
      </div>
    </div>
  );

  return showLayout ? <SectionLayout>{content}</SectionLayout> : content;
};
