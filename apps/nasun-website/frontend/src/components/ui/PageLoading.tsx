/**
 * PageLoading Component
 *
 * @description
 * 전체 페이지 로딩용 컴포넌트 (전체 화면 높이)
 * 인증 프로세스, 페이지 전환 등에서 사용
 *
 * @author Claude Code
 * @date 2025-10-27
 */

import React from "react";
import { useTranslation } from "react-i18next";

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
      <div className="flex items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-100"></div>
        <span className="ml-3 text-base text-nasun-white">
          {message || t("info.loading")}
        </span>
      </div>
    </div>
  );
};

// Backward compatibility: default export
export default PageLoading;
