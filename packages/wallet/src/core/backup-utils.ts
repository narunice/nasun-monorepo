/**
 * Backup Utilities
 *
 * Shared utilities for backup file download and parsing,
 * used by both Wallet Backup and NSA Backup.
 */

const MAX_BACKUP_FILE_SIZE = 1_048_576; // 1MB

/**
 * Download an object as a JSON file.
 *
 * @param data - Object to serialize as JSON
 * @param filename - Download filename (e.g., "nasun-backup-xxxx.json")
 */
export function downloadBackupFile(data: object, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

/**
 * Parse and validate a backup JSON file.
 *
 * @param file - File object from file input
 * @param validator - Type guard function to validate the parsed data
 * @returns Validated backup data
 * @throws Error if file is too large, invalid JSON, or fails validation
 */
export async function parseBackupJson<T>(
  file: File,
  validator: (data: unknown) => data is T,
): Promise<T> {
  if (file.size > MAX_BACKUP_FILE_SIZE) {
    throw new Error('Backup file is too large (max 1MB)');
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file');
  }

  if (!validator(parsed)) {
    throw new Error('Invalid backup file format');
  }

  return parsed;
}
