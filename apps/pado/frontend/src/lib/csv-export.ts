/**
 * CSV Export Utility
 * Generates CSV files from trade data for download.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

export interface CsvSection {
  title: string;
  csv: string;
}

// Characters that trigger formula evaluation in Excel/Sheets
const FORMULA_PREFIX_RE = /^[=+\-@\t\r|]/;

function sanitizeCell(val: string): string {
  let safe = val;
  if (FORMULA_PREFIX_RE.test(safe)) {
    safe = "'" + safe;
  }
  if (/[,"\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Generate a CSV string from typed data using column definitions.
 */
export function generateCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => sanitizeCell(c.header)).join(',');
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor(row);
        if (typeof val === 'string') {
          return sanitizeCell(val);
        }
        const num = Number(val);
        return isFinite(num) ? String(val) : '0';
      })
      .join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * Generate a multi-section CSV string for portfolio exports.
 * Sections are separated by blank lines and titled headers.
 */
export function generateMultiSectionCsv(sections: CsvSection[]): string {
  return sections
    .map((section) => `--- ${sanitizeCell(section.title)} ---\n${section.csv}`)
    .join('\n\n');
}

/**
 * Trigger a browser download of a CSV file.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
