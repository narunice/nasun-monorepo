/**
 * Process-wide log helper.
 *
 * Extracted from index.ts so cycle runners can write to a single
 * timestamped console stream without re-importing or re-implementing the
 * timestamp format. The `en-US` locale matches the project convention
 * (see root CLAUDE.md — "Date/time format: date.toLocaleString('en-US')")
 * so log lines stay consistent with other Nasun runtimes.
 */

export function log(msg: string): void {
  const ts = new Date().toLocaleString('en-US');
  console.log(`[${ts}] ${msg}`);
}
