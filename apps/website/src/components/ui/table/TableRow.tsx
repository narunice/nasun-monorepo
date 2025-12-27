import React from "react";
import type { TableVariant } from "./Table";

/**
 * Row border 색상 매핑
 */
const rowBorderStyles = {
  default: "border-gray-600",
  c1: "border-nasun-c1/20",
  c2: "border-nasun-c2/20",
  c3: "border-nasun-c3/20",
  c4: "border-nasun-c4/20",
  c5: "border-nasun-c5/20",
};

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  variant?: TableVariant;
  isLast?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * TableRow Component
 *
 * 테이블의 tr 요소
 * isLast prop으로 마지막 행의 border를 제거할 수 있습니다.
 * React.HTMLAttributes를 확장하여 data-* 등 추가 HTML 속성을 지원합니다.
 *
 * @example
 * <TableRow variant="c3" isLast={false} data-username="john">
 *   <TableCell>Data 1</TableCell>
 *   <TableCell>Data 2</TableCell>
 * </TableRow>
 */
export const TableRow = ({
  variant = "default",
  isLast = false,
  children,
  className = "",
  ...htmlAttributes
}: TableRowProps) => {
  const borderColor = rowBorderStyles[variant];

  return (
    <tr
      className={`${!isLast ? `border-b ${borderColor}` : ""} ${className}`.trim()}
      {...htmlAttributes}
    >
      {children}
    </tr>
  );
};
