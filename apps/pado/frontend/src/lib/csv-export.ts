/**
 * CSV Export Utility
 * Generates CSV files from trade data for download.
 */

interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

/**
 * Generate a CSV string from typed data using column definitions.
 */
export function generateCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => c.header).join(',');
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor(row);
        // Escape strings containing commas, quotes, or newlines
        if (typeof val === 'string' && /[,"\n\r]/.test(val)) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      })
      .join(','),
  );
  return [header, ...rows].join('\n');
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
