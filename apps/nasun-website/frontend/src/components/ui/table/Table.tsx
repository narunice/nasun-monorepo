import React from "react";

/**
 * Variant 스타일 정의
 * - default: 현재 My Account 디자인 유지
 * - c1~c5: Nasun 컬러팔레트 기반
 */
const variantStyles = {
  default: {
    border: "border-gray-600",
    bg: "bg-gray-900/80",
  },
  c1: {
    border: "border-nasun-c1/50",
    bg: "bg-gray-900/80",
  },
  c2: {
    border: "border-nasun-c2/50",
    bg: "bg-gray-900/80",
  },
  c3: {
    border: "border-nasun-c3/50",
    bg: "bg-gray-900/80",
  },
  c4: {
    border: "border-nasun-c4/60",
    bg: "bg-gray-900/80",
  },
  c5: {
    border: "border-nasun-c5/60",
    bg: "bg-gray-900/80",
  },
};

export type TableVariant = keyof typeof variantStyles;

export interface TableProps {
  variant?: TableVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * Table Component
 *
 * UI Showcase 디자인 기반의 재사용 가능한 테이블 컴포넌트
 *
 * @example
 * <Table variant="c3">
 *   <TableHeader variant="c3">...</TableHeader>
 *   <TableBody>...</TableBody>
 * </Table>
 */
export const Table = ({ variant = "default", children, className = "" }: TableProps) => {
  const styles = variantStyles[variant];

  return (
    <div className={`rounded-xl overflow-hidden border ${styles.border} ${styles.bg}`.trim()}>
      <div className="overflow-x-auto custom-scrollbar">
        <table className={`w-full ${className}`.trim()}>{children}</table>
      </div>
    </div>
  );
};
