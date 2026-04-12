/**
 * Ecosystem matview migration.
 *
 * PostgreSQL materialized views cannot be redefined in place — CREATE
 * MATERIALIZED VIEW has no OR REPLACE form, and the schema file's
 * IF NOT EXISTS short-circuits when the view already has the old formula.
 * Past weight changes (staking exclusion, pado-dex weight) required manual
 * psql DROP + CREATE on prod; easy to forget, painful when missed.
 *
 * Runtime behavior:
 *   - On scanner startup, checkEcosystemMatviewVersion() reads the matview's
 *     COMMENT and logs a WARN if it doesn't match MATVIEW_VERSION. No DDL.
 *     The scanner's DB role lacks CREATE privilege on schema public, so
 *     automatic rebuilds cannot run from here — they'd just fail silently.
 *   - To actually apply a version bump, a privileged operator runs
 *     `node dist/db/ecosystem-matview-migration.js` as a DB superuser
 *     (pnpm build first). See `runAsCli` below.
 *
 * WHEN THE FORMULA CHANGES
 *   1. Edit MATVIEW_SQL to reflect the new formula
 *   2. Bump MATVIEW_VERSION
 *   3. Update ecosystem-schema.sql to match (canonical source for humans)
 *   4. Deploy code. Scanner logs a version-mismatch WARN on boot.
 *   5. Operator runs the CLI above (or equivalent psql) to apply.
 */

import { pointsDb } from '../db.js';

const MATVIEW_VERSION = 2;
const VERSION_MARKER = `matview_version=${MATVIEW_VERSION}`;

const MATVIEW_SQL = `
CREATE MATERIALIZED VIEW ecosystem_daily_scores AS
WITH distinct_cats AS (
  SELECT DISTINCT
    identity_id,
    date_trunc('day', tx_timestamp)::date AS day,
    category
  FROM activity_points
  WHERE NOT flagged
    AND identity_id IS NOT NULL
    AND category NOT IN ('referral-bonus', 'daily-mission', 'ecosystem-passive', 'staking-daily', 'staking')
    AND category NOT LIKE 'ecosystem-bonus-%'
)
SELECT
  identity_id,
  day,
  SUM(CASE WHEN category = 'pado-dex' THEN 2 ELSE 1 END)::int AS base_score
FROM distinct_cats
GROUP BY identity_id, day
`;

/**
 * Startup check: log a WARN if the running matview predates MATVIEW_VERSION.
 * Intentionally read-only. Does NOT attempt rebuild (scanner role can't).
 */
export async function checkEcosystemMatviewVersion(): Promise<void> {
  if (!pointsDb) return;

  const [existsRow] = await pointsDb`
    SELECT to_regclass('public.ecosystem_daily_scores') AS reg
  `;
  if (!existsRow?.reg) {
    console.warn(
      '[Matview] ecosystem_daily_scores is MISSING. ' +
      'API endpoints querying it will 500. ' +
      'Run the migration CLI as a DB superuser to rebuild.',
    );
    return;
  }

  const [commentRow] = await pointsDb`
    SELECT obj_description('ecosystem_daily_scores'::regclass, 'pg_class') AS comment
  `;
  const current = commentRow?.comment as string | null;
  if (!current || !current.includes(VERSION_MARKER)) {
    console.warn(
      `[Matview] ecosystem_daily_scores version mismatch ` +
      `(current="${current ?? 'none'}", expected="${VERSION_MARKER}"). ` +
      `Data served may reflect the old formula until a superuser rebuilds.`,
    );
  }
}

/**
 * Rebuild the matview at the current MATVIEW_VERSION. Requires a DB role
 * with CREATE privilege on schema public — typically only the Postgres
 * superuser. Not called from scanner startup.
 *
 * Uses a temp-name + RENAME swap so readers see at most a brief RENAME lock
 * instead of a gap where the view doesn't exist. Sets lock_timeout so a
 * stuck long-running API query causes fast failure instead of indefinite
 * blocking.
 */
export async function rebuildEcosystemMatview(): Promise<void> {
  if (!pointsDb) throw new Error('POINTS_DATABASE_URL not configured');

  const [existsRow] = await pointsDb`
    SELECT to_regclass('public.ecosystem_daily_scores') AS reg
  `;
  const exists = Boolean(existsRow?.reg);

  if (exists) {
    console.log(`[Matview] Rebuilding ecosystem_daily_scores to ${VERSION_MARKER} via swap`);
    await rebuildViaSwap();
  } else {
    console.log('[Matview] Creating ecosystem_daily_scores (first run)');
    await createFresh();
  }
  await pointsDb`REFRESH MATERIALIZED VIEW ecosystem_daily_scores`;
  console.log(`[Matview] ecosystem_daily_scores ready at v${MATVIEW_VERSION}`);
}

async function createFresh(): Promise<void> {
  if (!pointsDb) return;
  await pointsDb.begin(async (tx) => {
    await tx.unsafe(MATVIEW_SQL);
    await tx`CREATE UNIQUE INDEX idx_eco_daily_identity_day ON ecosystem_daily_scores(identity_id, day)`;
    await tx`CREATE INDEX idx_eco_daily_day_score ON ecosystem_daily_scores(day, base_score DESC)`;
    await tx`ALTER MATERIALIZED VIEW ecosystem_daily_scores OWNER TO sui_indexer`;
    await tx.unsafe(
      `COMMENT ON MATERIALIZED VIEW ecosystem_daily_scores IS '${VERSION_MARKER}'`,
    );
  });
}

async function rebuildViaSwap(): Promise<void> {
  if (!pointsDb) return;
  const stamp = Date.now();
  const newName = `ecosystem_daily_scores_v${MATVIEW_VERSION}_${stamp}`;
  const retiredName = `ecosystem_daily_scores_retired_${stamp}`;

  // Build the replacement out-of-band. No txn wrap: CREATE MATERIALIZED VIEW
  // populates data and can be expensive; we don't want a long txn holding locks.
  const createSql = MATVIEW_SQL.replace(
    'CREATE MATERIALIZED VIEW ecosystem_daily_scores AS',
    `CREATE MATERIALIZED VIEW ${newName} AS`,
  );
  await pointsDb.unsafe(createSql);
  try {
    await pointsDb.unsafe(
      `CREATE UNIQUE INDEX idx_${newName}_identity_day ON ${newName}(identity_id, day)`,
    );
    await pointsDb.unsafe(
      `CREATE INDEX idx_${newName}_day_score ON ${newName}(day, base_score DESC)`,
    );
    await pointsDb.unsafe(`ALTER MATERIALIZED VIEW ${newName} OWNER TO sui_indexer`);
    await pointsDb.unsafe(
      `COMMENT ON MATERIALIZED VIEW ${newName} IS '${VERSION_MARKER}'`,
    );

    // Atomic swap: both renames commit together or not at all.
    await pointsDb.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '5s'`;
      await tx.unsafe(
        `ALTER MATERIALIZED VIEW ecosystem_daily_scores RENAME TO ${retiredName}`,
      );
      await tx.unsafe(
        `ALTER MATERIALIZED VIEW ${newName} RENAME TO ecosystem_daily_scores`,
      );
      await tx.unsafe(
        `ALTER INDEX idx_${newName}_identity_day RENAME TO idx_eco_daily_identity_day`,
      );
      await tx.unsafe(
        `ALTER INDEX idx_${newName}_day_score RENAME TO idx_eco_daily_day_score`,
      );
    });

    try {
      await pointsDb.unsafe(
        `DROP MATERIALIZED VIEW IF EXISTS ${retiredName} CASCADE`,
      );
    } catch (err) {
      console.warn(
        `[Matview] Failed to drop retired ${retiredName}:`,
        (err as Error).message,
      );
    }
  } catch (err) {
    try {
      await pointsDb.unsafe(`DROP MATERIALIZED VIEW IF EXISTS ${newName} CASCADE`);
    } catch { /* orphan cleanup best-effort */ }
    throw err;
  }
}

// CLI entry: `node dist/db/ecosystem-matview-migration.js` after pnpm build.
// Runs with whatever role POINTS_DATABASE_URL provides; an operator should
// set the URL to a superuser (or run via psql) if the scanner's role lacks
// CREATE privilege on schema public.
// @ts-expect-error - process exists at runtime in Node
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('ecosystem-matview-migration.js')) {
  rebuildEcosystemMatview()
    .then(() => {
      console.log('[Matview] Done');
      // @ts-expect-error - process exists at runtime
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Matview] Failed:', err);
      // @ts-expect-error - process exists at runtime
      process.exit(1);
    });
}
