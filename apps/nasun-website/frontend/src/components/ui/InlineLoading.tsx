/**
 * InlineLoading Component
 *
 * @description
 * 버튼 내부, 작은 영역에서 사용하는 인라인 로딩 컴포넌트
 * 크기 조절 가능한 스피너 + 옵션 텍스트
 *
 * @author Claude Code
 * @date 2025-10-27
 */

import React from "react";

interface InlineLoadingProps {
  /** 커스텀 로딩 메시지 (옵션) */
  message?: string;
  /** 스피너 크기 */
  size?: "sm" | "md" | "lg";
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * InlineLoading
 *
 * @example
 * // 작은 크기
 * <InlineLoading size="sm" />
 *
 * @example
 * // 메시지 포함
 * <InlineLoading size="md" message="Processing..." />
 *
 * @example
 * // 버튼 내부
 * <button disabled>
 *   <InlineLoading size="sm" message="Saving..." />
 * </button>
 */
export const InlineLoading: React.FC<InlineLoadingProps> = ({
  message,
  size = "md",
  className = "",
}) => {

  const sizeClasses = {
    sm: "h-4 w-4 border-b-2",
    md: "h-6 w-6 border-b-2",
    lg: "h-8 w-8 border-b-2",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div className={`inline-flex items-center ${className}`}>
      <div
        className={`animate-spin rounded-full border-gray-100 ${sizeClasses[size]}`}
      ></div>
      {message && (
        <span className={`ml-2 text-nasun-white ${textSizeClasses[size]}`}>
          {message}
        </span>
      )}
    </div>
  );
};
