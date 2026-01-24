import React from "react";
import type { TableVariant } from "./Table";

/**
 * Header Variant 스타일 정의
 */
const headerVariantStyles = {
  default: {
    bg: "bg-nasun-white/10",
    border: "border-nasun-white/10",
  },
  c1: {
    bg: "bg-nasun-c1/10",
    border: "border-nasun-c1",
  },
  c2: {
    bg: "bg-nasun-c2/10",
    border: "border-nasun-c2",
  },
  c3: {
    bg: "bg-nasun-c3/10",
    border: "border-nasun-c3",
  },
  c4: {
    bg: "bg-nasun-c4/10",
    border: "border-nasun-c4",
  },
  c5: {
    bg: "bg-nasun-c5/10",
    border: "border-nasun-c5",
  },
};

export interface TableHeaderProps {
  variant?: TableVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * TableHeader Component
 *
 * 테이블의 thead 요소
 * variant에 따라 배경색과 border 색상이 변경됩니다.
 *
 * @example
 * <TableHeader variant="c3">
 *   <TableRow>
 *     <TableHead>Column 1</TableHead>
 *   </TableRow>
 * </TableHeader>
 */
export const TableHeader = ({
  variant = "default",
  children,
  className = "",
}: TableHeaderProps) => {
  const styles = headerVariantStyles[variant];

  return (
    <thead className={`border-b ${styles.bg} ${styles.border} ${className}`.trim()}>
      {children}
    </thead>
  );
};
