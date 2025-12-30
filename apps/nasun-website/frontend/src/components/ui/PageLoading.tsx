/**
 * PageLoading Component
 *
 * @description
 * 전체 페이지 로딩용 컴포넌트 (전체 화면 높이)
 * 인증 프로세스, 페이지 전환 등에서 사용
 * InlineLoading을 재사용하여 HeroSection 로딩과 시각적 일관성 유지
 *
 * @author Claude Code
 * @date 2025-10-27
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { InlineLoading } from "./InlineLoading";

interface PageLoadingProps {
  /** 커스텀 로딩 메시지 */
  message?: string;
}

/**
 * PageLoading
 *
 * @example
 * // 기본 사용
 * <PageLoading />
 *
 * @example
 * // 커스텀 메시지
 * <PageLoading message="Authenticating..." />
 */
export const PageLoading: React.FC<PageLoadingProps> = ({ message }) => {
  const { t } = useTranslation("common");

  return (
    <div className="h-screen w-full flex items-center justify-center bg-nasun-black">
      <InlineLoading message={message || t("info.loading")} size="lg" />
    </div>
  );
};

// Backward compatibility: default export
export default PageLoading;
