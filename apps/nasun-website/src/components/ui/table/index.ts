/**
 * Table Components
 *
 * UI Showcase 디자인 기반의 재사용 가능한 테이블 컴포넌트 시스템
 *
 * @example
 * import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
 *
 * <Table variant="c3">
 *   <TableHeader variant="c3">
 *     <TableRow>
 *       <TableHead>Column 1</TableHead>
 *       <TableHead>Column 2</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow variant="c3">
 *       <TableCell>Data 1</TableCell>
 *       <TableCell>Data 2</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 */

export { Table } from "./Table";
export type { TableProps, TableVariant } from "./Table";

export { TableHeader } from "./TableHeader";
export type { TableHeaderProps } from "./TableHeader";

export { TableBody } from "./TableBody";
export type { TableBodyProps } from "./TableBody";

export { TableRow } from "./TableRow";
export type { TableRowProps } from "./TableRow";

export { TableHead } from "./TableHead";
export type { TableHeadProps } from "./TableHead";

export { TableCell } from "./TableCell";
export type { TableCellProps } from "./TableCell";
