/**
 * PageTitle Component
 *
 * 페이지 최상단 타이틀 컴포넌트 (Founders 페이지 스타일 기준)
 *
 * @features
 * - 네비게이션 바 충돌 방지: mt-24 xl:mt-28
 * - 커스터마이징: 태그, 정렬, 색상
 *
 * @example
 * ```tsx
 * <PageTitle as="h2" align="center">
 *   {t("founders")}
 * </PageTitle>
 * ```
 */

import React from "react";

export interface PageTitleProps {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  align?: "center" | "left";
  className?: string;
  textColor?: string;
}

export const PageTitle: React.FC<PageTitleProps> = ({
  children,
  as: Component = "h2",
  align = "center",
  className = "",
  textColor = "text-nasun-white",
}) => {
  const alignmentClass = align === "center" ? "text-center" : "text-left";

  return (
    <div className="flex flex-col gap-3 mt-12 mb-6 md:mb-8 lg:mb-10 xl:mb-12">
      <Component
        className={`${alignmentClass} uppercase font-medium ${textColor} ${className}`.trim()}
      >
        {children}
      </Component>
    </div>
  );
};
