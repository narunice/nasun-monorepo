/**
 * Ecosystem Score Snapshot Backup
 *
 * Exports ecosystem_score_snapshots to local CSV files.
 * Supports incremental backup (only new dates since last backup).
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/backup-snapshots.ts                  # incremental (new dates only)
 *   npx tsx src/scripts/backup-snapshots.ts --full            # full export
 *   npx tsx src/scripts/backup-snapshots.ts --date 2026-04-01 # single date
 *   npx tsx src/scripts/backup-snapshots.ts --from 2026-03-01 --to 2026-04-01
 */

import postgres from 'postgres';
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = resolve(
  process.env.SNAPSHOT_BACKUP_DIR || join(__dirname, '../../backups/snapshots'),
);

const CSV_HEADER =
  'identity_id,snapshot_date,base_score,multiplier,bonus_total,ecosystem_score,is_penalized,rank,is_backfilled,created_at';

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--full') {
      flags.full = true;
    } else if (arg === '--date' && args[i + 1]) {
      flags.date = args[++i];
    } else if (arg === '--from' && args[i + 1]) {
      flags.from = args[++i];
    } else if (arg === '--to' && args[i + 1]) {
      flags.to = args[++i];
    }
  }
  return flags;
}

function toCsvRow(row: Record<string, unknown>): string {
  return [
    row.identity_id,
    row.snapshot_date,
    row.base_score,
    row.multiplier,
    row.bonus_total,
    row.ecosystem_score,
    row.is_penalized,
    row.rank ?? '',
    row.is_backfilled,
    row.created_at,
  ].join(',');
}

async function getAvailableDates(from?: string, to?: string): Promise<string[]> {
  const rows = await db`
    SELECT DISTINCT snapshot_date::text as d
    FROM ecosystem_score_snapshots
    ${from ? db`WHERE snapshot_date >= ${from}::date` : db``}
    ${from && to ? db`AND snapshot_date <= ${to}::date` : to ? db`WHERE snapshot_date <= ${to}::date` : db``}
    ORDER BY d
  `;
  return rows.map((r) => r.d as string);
}

function getBackedUpDates(): Set<string> {
  if (!existsSync(BACKUP_DIR)) return new Set();
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.csv'));
  // filename pattern: snapshot_YYYY-MM-DD.csv
  const dates = new Set<string>();
  for (const f of files) {
    const match = f.match(/^snapshot_(\d{4}-\d{2}-\d{2})\.csv$/);
    if (match) dates.add(match[1]);
  }
  return dates;
}

async function backupDate(date: string): Promise<number> {
  const rows = await db`
    SELECT
      identity_id, snapshot_date::text, base_score, multiplier,
      bonus_total, ecosystem_score, is_penalized, rank,
      is_backfilled, created_at::text
    FROM ecosystem_score_snapshots
    WHERE snapshot_date = ${date}::date
    ORDER BY rank NULLS LAST, ecosystem_score DESC
  `;

  if (rows.length === 0) return 0;

  const csv = [CSV_HEADER, ...rows.map(toCsvRow)].join('\n') + '\n';
  const filePath = join(BACKUP_DIR, `snapshot_${date}.csv`);
  writeFileSync(filePath, csv, 'utf-8');

  return rows.length;
}

async function main() {
  const flags = parseArgs();

  mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`\n=== Snapshot Backup ===`);
  console.log(`  Backup dir: ${BACKUP_DIR}\n`);

  let datesToBackup: string[];

  if (flags.date) {
    // Single date
    datesToBackup = [flags.date as string];
    console.log(`  Mode: single date (${flags.date})`);
  } else if (flags.full) {
    // Full export
    datesToBackup = await getAvailableDates();
    console.log(`  Mode: full export (${datesToBackup.length} dates in DB)`);
  } else if (flags.from || flags.to) {
    // Date range
    datesToBackup = await getAvailableDates(flags.from as string, flags.to as string);
    console.log(
      `  Mode: range ${flags.from || '*'} ~ ${flags.to || '*'} (${datesToBackup.length} dates)`,
    );
  } else {
    // Incremental: only new dates
    const allDates = await getAvailableDates();
    const backedUp = getBackedUpDates();
    datesToBackup = allDates.filter((d) => !backedUp.has(d));
    console.log(
      `  Mode: incremental (${allDates.length} total, ${backedUp.size} backed up, ${datesToBackup.length} new)`,
    );
  }

  if (datesToBackup.length === 0) {
    console.log('  Nothing to backup.\n');
    await db.end();
    return;
  }

  let totalRows = 0;
  for (const date of datesToBackup) {
    const count = await backupDate(date);
    totalRows += count;
    console.log(`  ${date}: ${count} rows`);
  }

  // Write manifest
  const manifest = {
    lastBackup: new Date().toISOString(),
    totalDates: datesToBackup.length,
    totalRows,
    dates: datesToBackup,
  };
  writeFileSync(join(BACKUP_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\n  Total: ${totalRows} rows across ${datesToBackup.length} dates`);
  console.log(`  Manifest: ${join(BACKUP_DIR, 'manifest.json')}\n`);

  await db.end();
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
