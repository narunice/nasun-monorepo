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
import { Spinner } from "./Spinner";

interface InlineLoadingProps {
  /** 커스텀 로딩 메시지 (옵션) */
  message?: string;
  /** 스피너 크기 */
  size?: "sm" | "md" | "lg";
  /** 추가 CSS 클래스 */
  className?: string;
}

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export const InlineLoading: React.FC<InlineLoadingProps> = ({
  message,
  size = "md",
  className = "",
}) => {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <Spinner size={size} />
      {message && (
        <span className={`ml-2 text-nasun-white ${textSizeClasses[size]}`}>
          {message}
        </span>
      )}
    </div>
  );
};
