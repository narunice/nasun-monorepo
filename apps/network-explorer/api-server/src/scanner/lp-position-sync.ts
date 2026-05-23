/**
 * Hourly snapshot of each identity's net GoStop bankroll LP position (USD).
 *
 * The gostop-backend writes raw deposit/withdraw rows to `gostop.bankroll_event`
 * on the same node-3 PostgreSQL instance, so we can compute current LP balance
 * with a cross-schema aggregate. The result is upserted into
 * `user_lp_daily_snapshots(venue='gostop-bankroll')` and the `nsi-compute`
 * worker averages the last 30 days to derive the LP sub-score.
 *
 * Phase 1 scope: GoStop bankroll only. Pado spot LP (DeepBook V3 maker order
 * tracking) is deferred to Phase 2 — when added it lands in the same table
 * with `venue='pado-spot'`.
 */

import { pointsDb } from '../db.js';
import { sendTelegramAlert } from '../utils/alert.js';

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1h
const VENUE = 'gostop-bankroll';
const NUSDC_MICRO_PER_USD = 1_000_000; // NUSDC has 6 decimals
const RETENTION_DAYS = 90;
// postgres.js parameter cap (65535); 4 columns -> 16_000 rows = 64_000 params.
const UPSERT_BATCH_SIZE = 10_000;

let lastSuccessAt: Date | null = null;
let errorCount24h = 0;
let timer: NodeJS.Timeout | null = null;

export function startLpPositionSync(): void {
  if (process.env.ENABLE_LP_POSITION_SYNC !== 'true') {
    console.log('[lp-position-sync] disabled (set ENABLE_LP_POSITION_SYNC=true)');
    return;
  }
  if (!pointsDb) {
    console.warn('[lp-position-sync] pointsDb unavailable, skipping');
    return;
  }
  timer = setInterval(runSync, SYNC_INTERVAL_MS);
  runSync().catch((err) => console.error('[lp-position-sync] initial run failed', err));
}

export function stopLpPositionSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function runSync(): Promise<void> {
  if (!pointsDb) return;
  const started = Date.now();

  try {
    // Net LP USD per actor from raw event log.
    // Schema reference: apps/gostop/backend/src/indexer/streams/bankroll-pool.ts:73-75
    //   gostop.bankroll_event(event_type text, actor text, amount numeric, ...)
    //   event_type values include 'liquidity_provided' / 'liquidity_redeemed' (NOT 'liquidity_withdrawn').
    //   amount is in NUSDC micro-units (6 decimals).
    //   Phase 1 uses NUSDC `amount` as the LP USD proxy (≈ shares at launch NAV). Phase 2
    //   should switch to shares × current NAV via gostop.bankroll_share_price when NAV diverges.
    const lpPositions = await pointsDb<Array<{ actor: string; net_lp_usd: string }>>`
      SELECT
        actor,
        (SUM(CASE
              WHEN event_type = 'liquidity_provided' THEN amount
              WHEN event_type = 'liquidity_redeemed' THEN -amount
              ELSE 0
            END) / ${NUSDC_MICRO_PER_USD}::numeric
        )::text AS net_lp_usd
      FROM gostop.bankroll_event
      WHERE event_type IN ('liquidity_provided', 'liquidity_redeemed')
      GROUP BY actor
      HAVING SUM(CASE
                  WHEN event_type = 'liquidity_provided' THEN amount
                  WHEN event_type = 'liquidity_redeemed' THEN -amount
                  ELSE 0
                END) > 0
    `;

    // Map wallet → identity (latest seen in activity_points).
    const walletRows = await pointsDb<Array<{ wallet_address: string; identity_id: string }>>`
      SELECT DISTINCT ON (LOWER(wallet_address)) LOWER(wallet_address) AS wallet_address, identity_id
      FROM activity_points
      WHERE wallet_address IS NOT NULL AND identity_id IS NOT NULL
      ORDER BY LOWER(wallet_address), processed_at DESC
    `;
    const walletToIdentity = new Map<string, string>();
    for (const { wallet_address, identity_id } of walletRows) {
      walletToIdentity.set(wallet_address, identity_id);
    }

    // Some identities may control multiple wallets; sum across them.
    const today = new Date().toISOString().slice(0, 10);
    const byIdentity = new Map<string, number>();
    for (const { actor, net_lp_usd } of lpPositions) {
      const identityId = walletToIdentity.get(actor.toLowerCase());
      if (!identityId) continue;
      const lpUsd = Number(net_lp_usd);
      if (!Number.isFinite(lpUsd) || lpUsd <= 0) continue;
      byIdentity.set(identityId, (byIdentity.get(identityId) ?? 0) + lpUsd);
    }

    const toUpsert = [...byIdentity.entries()].map(([identity_id, lp_usd]) => ({
      identity_id,
      day: today,
      venue: VENUE,
      lp_usd: lp_usd.toFixed(4),
    }));

    for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH_SIZE) {
      const slice = toUpsert.slice(i, i + UPSERT_BATCH_SIZE);
      await pointsDb`
        INSERT INTO user_lp_daily_snapshots ${pointsDb(
          slice,
          'identity_id',
          'day',
          'venue',
          'lp_usd',
        )}
        ON CONFLICT (identity_id, day, venue) DO UPDATE SET
          lp_usd = EXCLUDED.lp_usd,
          captured_at = now()
      `;
    }

    await pointsDb`
      DELETE FROM user_lp_daily_snapshots
      WHERE day < CURRENT_DATE - (${RETENTION_DAYS}::int * INTERVAL '1 day')
    `;

    lastSuccessAt = new Date();
    errorCount24h = 0;
    console.log(
      `[lp-position-sync] snapshotted ${toUpsert.length} identities ` +
        `(${lpPositions.length} actors raw) in ${Date.now() - started}ms`,
    );
  } catch (err) {
    errorCount24h++;
    console.error('[lp-position-sync] failed', err);
    if (errorCount24h % 6 === 1) {
      try {
        await sendTelegramAlert(
          `lp-position-sync failed (${errorCount24h}x in 24h): ${(err as Error).message}`,
          { dedupKey: 'lp-position-sync-fail' },
        );
      } catch {
        // ignore
      }
    }
  }
}

export function getLpSyncHealth(): { lastSuccessAt: Date | null; errorCount24h: number } {
  return { lastSuccessAt, errorCount24h };
}
