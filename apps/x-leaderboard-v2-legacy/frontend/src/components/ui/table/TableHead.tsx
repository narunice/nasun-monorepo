import React from "react";

type AlignType = "left" | "center" | "right";

export interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
  align?: AlignType;
}

/**
 * TableHead Component
 *
 * 테이블의 th 요소 (헤더 셀)
 * UI Showcase 디자인: px-6 py-4, font-medium, text-white
 *
 * @example
 * <TableHead align="center">Column Name</TableHead>
 */
export const TableHead = ({ children, className = "", align = "left" }: TableHeadProps) => {
  const alignClass = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";

  return (
    <th className={`px-2 md:px-6 py-2 md:py-3 font-medium text-white uppercase ${alignClass} ${className}`.trim()}>
      {children}
    </th>
  );
};
