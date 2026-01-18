/**
 * Escape a value for CSV format
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double-escape internal quotes
 */
export function escapeCSVValue(value: string | undefined | null): string {
  if (value === undefined || value === null) {
    return "";
  }

  const stringValue = String(value);

  // Check if escaping is needed
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    // Double-escape quotes and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Generate CSV content from an array of objects
 */
export function generateCSV<T extends Record<string, unknown>>(
  items: T[],
  columns: { key: keyof T; header: string }[]
): string {
  // Header row
  const headerRow = columns.map((col) => col.header).join(",");

  // Data rows
  const dataRows = items.map((item) =>
    columns.map((col) => escapeCSVValue(item[col.key] as string)).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Generate filename with date
 */
export function generateFilename(prefix: string, suffix?: string): string {
  const date = new Date().toISOString().split("T")[0];
  if (suffix) {
    return `${prefix}-${suffix}-${date}.csv`;
  }
  return `${prefix}-${date}.csv`;
}
