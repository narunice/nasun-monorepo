import React from "react";

export interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * TableBody Component
 *
 * 테이블의 tbody 요소
 *
 * @example
 * <TableBody>
 *   <TableRow>
 *     <TableCell>Data</TableCell>
 *   </TableRow>
 * </TableBody>
 */
export const TableBody = ({ children, className = "" }: TableBodyProps) => {
  return <tbody className={className}>{children}</tbody>;
};
