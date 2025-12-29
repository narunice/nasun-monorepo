import React from "react";

type AlignType = "left" | "center" | "right";

export interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  align?: AlignType;
  colSpan?: number;
}

/**
 * TableCell Component
 *
 * 테이블의 td 요소 (데이터 셀)
 * UI Showcase 디자인: px-6 py-4, text-sm, text-nasun-white/80
 *
 * @example
 * <TableCell align="center">Data Value</TableCell>
 */
export const TableCell = ({ children, className = "", align = "left", colSpan }: TableCellProps) => {
  const alignClass =
    align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";

  return (
    <td
      className={`px-6 py-2 md:py-3 align-middle text-nasun-white/80 ${alignClass} ${className}`.trim()}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
};
