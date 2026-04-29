import { Hono } from 'hono';
import crypto from 'crypto';
import { pointsDb } from '../db.js';
import { OFFCHAIN_CATEGORIES } from '../config/categories.js';

const app = new Hono();

interface RequestBody {
  dateFrom?: string;
  dateTo?: string;
  walletsAny?: string[];
  walletsX?: string[];
  walletsGoogle?: string[];
  walletsTelegram?: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Sui wallet address: 0x-prefixed hex, normalized to 66 chars. Allow any 3..66
// hex-char length to tolerate legacy unpadded addresses in DynamoDB.
const WALLET_RE = /^0x[0-9a-f]{3,64}$/i;
const DEFAULT_DATE_FROM = '2026-03-05';
const INSERT_CHUNK_SIZE = 5000;
// Upper bound on combined wallet arrays. Total registered wallets today ~96K,
// x+google+telegram+any ~30K. 200K leaves headroom for growth while capping the
// blast radius of a leaked API key (each call drives a 45s multi-CTE query).
const MAX_WALLETS_PER_REQUEST = 200_000;

const MISSION_CATEGORIES = [
  'faucet',
  'wallet-transfer',
  'pado-dex',
  'gostop-lottery',
  'gostop-scratchcard',
  'gostop-numbermatch',
  'gostop-mines',
  'gostop-crash',
  'chat',
] as const;

const GAMES_CATEGORIES = [
  'gostop-lottery',
  'gostop-numbermatch',
  'gostop-mines',
  'gostop-crash',
  'gostop-scratchcard',
] as const;
const DEX_CATEGORIES = ['pado-dex'] as const;

// Top activities ordering ignores these admin/passive categories (matches skill Step4).
const TOP_EXCLUDED = [
  'ecosystem-passive',
  'ecosystem-bonus-restoration',
  'ecosystem-bonus-earlybird',
  'ecosystem-bonus-admin',
  'ecosystem-bonus-game',
  'ecosystem-bonus-creators-appreciation',
  'ecosystem-bonus-bugreport',
  'ecosystem-bonus-creator-posts',
  'ecosystem-bonus-alliance-airdrop',
  'ecosystem-bonus-genesis-pass-airdrop',
  'ecosystem-bonus-feedback',
];

// Category-breakdown excludes these same admin-only categories from yesterday view.
const YDAY_CAT_EXCLUDED = [
  'daily-mission',
  'ecosystem-passive',
  'ecosystem-bonus-restoration',
  'ecosystem-bonus-earlybird',
  'ecosystem-bonus-admin',
  'ecosystem-bonus-game',
  'ecosystem-bonus-creators-appreciation',
  'ecosystem-bonus-bugreport',
  'ecosystem-bonus-creator-posts',
  'ecosystem-bonus-alliance-airdrop',
  'ecosystem-bonus-genesis-pass-airdrop',
  'ecosystem-bonus-feedback',
];

function yesterdayUtcIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function timingSafeKeyCheck(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

app.post('/', async (c) => {
  const INTERNAL_API_KEY = process.env.NASUN_METRICS_API_KEY;
  const requestKey = c.req.header('x-api-key');
  if (!INTERNAL_API_KEY || !timingSafeKeyCheck(requestKey, INTERNAL_API_KEY)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  let body: RequestBody;
  try {
    body = await c.req.json<RequestBody>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const dateFrom = body.dateFrom ?? DEFAULT_DATE_FROM;
  const dateTo = body.dateTo ?? yesterdayUtcIso();
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    return c.json({ error: 'invalid_date_format' }, 400);
  }
  if (dateFrom > dateTo) {
    return c.json({ error: 'date_from_after_date_to' }, 400);
  }

  // Compute day-before-yesterday for d-1 retention (yday - 1 day, UTC-safe).
  const ydayDate = new Date(`${dateTo}T00:00:00Z`);
  const dbdDate = new Date(ydayDate.getTime() - 86_400_000);
  const dbd = dbdDate.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const walletsAny = body.walletsAny ?? [];
  const walletsX = body.walletsX ?? [];
  const walletsGoogle = body.walletsGoogle ?? [];
  const walletsTelegram = body.walletsTelegram ?? [];

  // Input validation: cap combined array size and reject malformed addresses.
  // `unnest($1::text[])` binds the array as a single parameter so SQL injection
  // isn't the concern; the risk is DoS via multi-GB arrays.
  const totalWallets =
    walletsAny.length + walletsX.length + walletsGoogle.length + walletsTelegram.length;
  if (totalWallets > MAX_WALLETS_PER_REQUEST) {
    return c.json(
      { error: 'too_many_wallets', limit: MAX_WALLETS_PER_REQUEST, got: totalWallets },
      413,
    );
  }
  for (const [name, arr] of [
    ['walletsAny', walletsAny],
    ['walletsX', walletsX],
    ['walletsGoogle', walletsGoogle],
    ['walletsTelegram', walletsTelegram],
  ] as const) {
    for (const w of arr) {
      if (typeof w !== 'string' || !WALLET_RE.test(w)) {
        return c.json({ error: 'invalid_wallet_address', field: name }, 400);
      }
    }
  }

  try {
    const result = await pointsDb.begin(async (txRaw) => {
      // TransactionSql drops call-signature typing via Omit<Sql>; cast back for
      // tagged-template + helper invocation.
      const tx = txRaw as unknown as typeof pointsDb;
      if (!tx) throw new Error('unreachable');
      // 1. Temp tables
      await tx.unsafe(
        `CREATE TEMP TABLE verified_wallets (wallet_address TEXT PRIMARY KEY) ON COMMIT DROP`,
      );
      await tx.unsafe(
        `CREATE TEMP TABLE x_wallets (wallet_address TEXT PRIMARY KEY) ON COMMIT DROP`,
      );
      await tx.unsafe(
        `CREATE TEMP TABLE google_wallets (wallet_address TEXT PRIMARY KEY) ON COMMIT DROP`,
      );
      await tx.unsafe(
        `CREATE TEMP TABLE telegram_wallets (wallet_address TEXT PRIMARY KEY) ON COMMIT DROP`,
      );

      // 2. Chunked inserts for each wallet set
      const insertChunks = async (table: string, wallets: string[]) => {
        for (const c of chunk(wallets, INSERT_CHUNK_SIZE)) {
          await tx`INSERT INTO ${tx(table)} (wallet_address) SELECT unnest(${c}::text[]) ON CONFLICT DO NOTHING`;
        }
      };
      await insertChunks('verified_wallets', walletsAny);
      await insertChunks('x_wallets', walletsX);
      await insertChunks('google_wallets', walletsGoogle);
      await insertChunks('telegram_wallets', walletsTelegram);

      // 3. ANALYZE so the planner picks good joins
      await tx.unsafe('ANALYZE verified_wallets');
      await tx.unsafe('ANALYZE x_wallets');
      await tx.unsafe('ANALYZE google_wallets');
      await tx.unsafe('ANALYZE telegram_wallets');

      // 4. Main daily series (matches skill Step3 SQL)
      const daily = await tx`
        WITH
        date_series AS (
          SELECT generate_series(${dateFrom}::date, ${dateTo}::date, '1 day'::interval)::date AS day
        ),
        onchain AS (
          SELECT wallet_address, tx_timestamp::date AS day
          FROM activity_points
          WHERE category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
            AND tx_timestamp >= ${dateFrom}::date
            AND tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
        ),
        first_seen AS (
          -- Bound to dateTo so this doesn't scan future rows. Past-date rows
          -- are still fully scanned (required for accurate MIN).
          SELECT wallet_address, MIN(tx_timestamp::date) AS first_day
          FROM activity_points
          WHERE category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
            AND tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY wallet_address
        ),
        daily_dau AS (
          SELECT day, COUNT(DISTINCT wallet_address) AS dau FROM onchain GROUP BY day
        ),
        new_per_day AS (
          SELECT first_day AS day, COUNT(*) AS new_addresses FROM first_seen
          WHERE first_day BETWEEN ${dateFrom}::date AND ${dateTo}::date
          GROUP BY first_day
        ),
        traders AS (
          SELECT tx_timestamp::date AS day, COUNT(DISTINCT wallet_address) AS unique_traders
          FROM activity_points
          WHERE category = 'pado-dex'
            AND tx_timestamp >= ${dateFrom}::date
            AND tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        gamers AS (
          SELECT tx_timestamp::date AS day, COUNT(DISTINCT wallet_address) AS unique_gamers
          FROM activity_points
          WHERE category IN ${tx(GAMES_CATEGORIES as unknown as string[])}
            AND tx_timestamp >= ${dateFrom}::date
            AND tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        vtraders AS (
          SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS verified_unique_traders
          FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
          WHERE ap.category = 'pado-dex'
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        vgamers AS (
          SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS verified_unique_gamers
          FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
          WHERE ap.category IN ${tx(GAMES_CATEGORIES as unknown as string[])}
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        dau_x AS (
          SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_x_social
          FROM activity_points ap JOIN x_wallets xw ON ap.wallet_address = xw.wallet_address
          WHERE ap.category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        dau_google AS (
          SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_google_social
          FROM activity_points ap JOIN google_wallets gw ON ap.wallet_address = gw.wallet_address
          WHERE ap.category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        dau_telegram AS (
          SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_telegram_social
          FROM activity_points ap JOIN telegram_wallets tw ON ap.wallet_address = tw.wallet_address
          WHERE ap.category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        dau_any AS (
          SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_any_social
          FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
          WHERE ap.category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1
        ),
        mission_per_user AS (
          SELECT ap.wallet_address, ap.tx_timestamp::date AS day,
            COUNT(DISTINCT ap.category) AS missions_done
          FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
          WHERE ap.category IN ${tx(MISSION_CATEGORIES as unknown as string[])}
            AND ap.tx_timestamp >= ${dateFrom}::date
            AND ap.tx_timestamp < (${dateTo}::date + INTERVAL '1 day')
          GROUP BY 1, 2
        ),
        missions AS (
          SELECT day,
            COUNT(*) FILTER (WHERE missions_done = 1) AS mission_1,
            COUNT(*) FILTER (WHERE missions_done = 2) AS mission_2,
            COUNT(*) FILTER (WHERE missions_done = 3) AS mission_3,
            COUNT(*) FILTER (WHERE missions_done = 4) AS mission_4,
            COUNT(*) FILTER (WHERE missions_done = 5) AS mission_5,
            COUNT(*) FILTER (WHERE missions_done >= 6) AS mission_6plus
          FROM mission_per_user GROUP BY day
        )
        SELECT
          ds.day,
          COALESCE(d.dau, 0)::int AS dau,
          COALESCE(n.new_addresses, 0)::int AS new_addresses,
          (COALESCE(d.dau, 0) - COALESCE(n.new_addresses, 0))::int AS returning_addresses,
          ROUND((COALESCE(d.dau,0) - COALESCE(n.new_addresses,0))::numeric
                / NULLIF(COALESCE(d.dau,0),0) * 100, 1)::float AS returning_pct,
          COALESCE(t.unique_traders, 0)::int AS unique_traders,
          COALESCE(g.unique_gamers, 0)::int AS unique_gamers,
          COALESCE(vt.verified_unique_traders, 0)::int AS verified_unique_traders,
          COALESCE(vg.verified_unique_gamers, 0)::int AS verified_unique_gamers,
          COALESCE(dx.dau_x_social, 0)::int AS dau_x_social,
          COALESCE(dg.dau_google_social, 0)::int AS dau_google_social,
          COALESCE(dtg.dau_telegram_social, 0)::int AS dau_telegram_social,
          COALESCE(da.dau_any_social, 0)::int AS dau_any_social,
          (COALESCE(d.dau, 0) - COALESCE(da.dau_any_social, 0))::int AS dau_no_social,
          COALESCE(m.mission_1, 0)::int AS mission_1,
          COALESCE(m.mission_2, 0)::int AS mission_2,
          COALESCE(m.mission_3, 0)::int AS mission_3,
          COALESCE(m.mission_4, 0)::int AS mission_4,
          COALESCE(m.mission_5, 0)::int AS mission_5,
          COALESCE(m.mission_6plus, 0)::int AS mission_6plus
        FROM date_series ds
        LEFT JOIN daily_dau   d   ON ds.day = d.day
        LEFT JOIN new_per_day n   ON ds.day = n.day
        LEFT JOIN traders     t   ON ds.day = t.day
        LEFT JOIN gamers      g   ON ds.day = g.day
        LEFT JOIN vtraders    vt  ON ds.day = vt.day
        LEFT JOIN vgamers     vg  ON ds.day = vg.day
        LEFT JOIN dau_x       dx  ON ds.day = dx.day
        LEFT JOIN dau_google  dg  ON ds.day = dg.day
        LEFT JOIN dau_telegram dtg ON ds.day = dtg.day
        LEFT JOIN dau_any     da  ON ds.day = da.day
        LEFT JOIN missions    m   ON ds.day = m.day
        ORDER BY ds.day
      `;

      // 5. Today's new user quality (rate)
      const rate = await tx`
        SELECT
          COUNT(*)::int AS new_total,
          SUM(CASE WHEN vw.wallet_address IS NOT NULL THEN 1 ELSE 0 END)::int AS new_verified
        FROM (
          SELECT wallet_address FROM activity_points
          WHERE category NOT IN ${tx(OFFCHAIN_CATEGORIES)}
          GROUP BY wallet_address
          HAVING MIN(tx_timestamp::date) = CURRENT_DATE
        ) new_today
        LEFT JOIN verified_wallets vw ON new_today.wallet_address = vw.wallet_address
      `;

      // 6. Top activities of social users (full period)
      const top = await tx`
        SELECT ap.category, COUNT(DISTINCT ap.wallet_address)::int AS unique_users
        FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
        WHERE ap.category NOT IN ${tx(TOP_EXCLUDED)}
        GROUP BY ap.category
        ORDER BY unique_users DESC
        LIMIT 8
      `;

      // 7. Yesterday per-category breakdown (skill Step4 CATSTAT)
      await tx.unsafe(`
        CREATE TEMP TABLE yday_cat ON COMMIT DROP AS
        SELECT DISTINCT category, wallet_address FROM activity_points
        WHERE tx_timestamp::date = '${dateTo}'::date
          AND category NOT IN ('${YDAY_CAT_EXCLUDED.join("','")}')
      `);
      await tx.unsafe(`
        CREATE TEMP TABLE first_seen_cat ON COMMIT DROP AS
        SELECT category, wallet_address, MIN(tx_timestamp::date) AS first_day
        FROM activity_points
        WHERE category IN (SELECT DISTINCT category FROM yday_cat)
        GROUP BY 1, 2
      `);
      await tx.unsafe(`
        CREATE TEMP TABLE dbd_cat ON COMMIT DROP AS
        SELECT DISTINCT category, wallet_address FROM activity_points
        WHERE tx_timestamp::date = '${dbd}'::date
          AND category IN (SELECT DISTINCT category FROM yday_cat)
      `);
      await tx.unsafe('CREATE INDEX ON first_seen_cat (category, wallet_address)');
      await tx.unsafe('CREATE INDEX ON dbd_cat (category, wallet_address)');

      const catstat = await tx`
        SELECT
          y.category,
          COUNT(*)::int AS total,
          COUNT(vw.wallet_address)::int AS verified,
          COUNT(CASE WHEN fsc.first_day < ${dateTo}::date THEN 1 END)::int AS returning,
          COUNT(dbd.wallet_address)::int AS retention_d1
        FROM yday_cat y
        LEFT JOIN verified_wallets vw ON y.wallet_address = vw.wallet_address
        LEFT JOIN first_seen_cat fsc ON fsc.category = y.category AND fsc.wallet_address = y.wallet_address
        LEFT JOIN dbd_cat dbd ON dbd.category = y.category AND dbd.wallet_address = y.wallet_address
        GROUP BY y.category
        ORDER BY total DESC
      `;

      // 8. Group stats (DEX + GAMES)
      const gamesGrp = await tx`
        WITH yg AS (
          SELECT DISTINCT wallet_address FROM yday_cat
          WHERE category IN ${tx(GAMES_CATEGORIES as unknown as string[])}
        ),
        fsg AS (
          SELECT wallet_address, MIN(tx_timestamp::date) AS first_day FROM activity_points
          WHERE category IN ${tx(GAMES_CATEGORIES as unknown as string[])} GROUP BY 1
        ),
        dbdg AS (
          SELECT DISTINCT wallet_address FROM activity_points
          WHERE tx_timestamp::date = ${dbd}::date
            AND category IN ${tx(GAMES_CATEGORIES as unknown as string[])}
        )
        SELECT
          COUNT(*)::int AS total,
          COUNT(vw.wallet_address)::int AS verified,
          COUNT(CASE WHEN fsg.first_day < ${dateTo}::date THEN 1 END)::int AS returning,
          COUNT(dbdg.wallet_address)::int AS retention_d1
        FROM yg
        LEFT JOIN verified_wallets vw ON yg.wallet_address = vw.wallet_address
        LEFT JOIN fsg ON fsg.wallet_address = yg.wallet_address
        LEFT JOIN dbdg ON dbdg.wallet_address = yg.wallet_address
      `;

      const dexGrp = await tx`
        WITH yd AS (
          SELECT DISTINCT wallet_address FROM yday_cat
          WHERE category IN ${tx(DEX_CATEGORIES as unknown as string[])}
        ),
        fsd AS (
          SELECT wallet_address, MIN(tx_timestamp::date) AS first_day FROM activity_points
          WHERE category IN ${tx(DEX_CATEGORIES as unknown as string[])} GROUP BY 1
        ),
        dbdd AS (
          SELECT DISTINCT wallet_address FROM activity_points
          WHERE tx_timestamp::date = ${dbd}::date
            AND category IN ${tx(DEX_CATEGORIES as unknown as string[])}
        )
        SELECT
          COUNT(*)::int AS total,
          COUNT(vw.wallet_address)::int AS verified,
          COUNT(CASE WHEN fsd.first_day < ${dateTo}::date THEN 1 END)::int AS returning,
          COUNT(dbdd.wallet_address)::int AS retention_d1
        FROM yd
        LEFT JOIN verified_wallets vw ON yd.wallet_address = vw.wallet_address
        LEFT JOIN fsd ON fsd.wallet_address = yd.wallet_address
        LEFT JOIN dbdd ON dbdd.wallet_address = yd.wallet_address
      `;

      return { daily, rate, top, catstat, gamesGrp, dexGrp };
    });

    // Post-process: derive summary fields
    const dailyRows = result.daily.map((r: any) => ({
      date: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
      dau: r.dau,
      newAddresses: r.new_addresses,
      returningAddresses: r.returning_addresses,
      returningPct: r.returning_pct,
      uniqueTraders: r.unique_traders,
      uniqueGamers: r.unique_gamers,
      verifiedUniqueTraders: r.verified_unique_traders,
      verifiedUniqueGamers: r.verified_unique_gamers,
      dauXSocial: r.dau_x_social,
      dauGoogleSocial: r.dau_google_social,
      dauTelegramSocial: r.dau_telegram_social,
      dauAnySocial: r.dau_any_social,
      dauNoSocial: r.dau_no_social,
      mission1: r.mission_1,
      mission2: r.mission_2,
      mission3: r.mission_3,
      mission4: r.mission_4,
      mission5: r.mission_5,
      mission6plus: r.mission_6plus,
    }));

    const activeRows = dailyRows.filter((r) => r.dau > 0);
    const peak = activeRows.length
      ? activeRows.reduce((a, b) => (b.dau > a.dau ? b : a))
      : null;
    const avgDau = activeRows.length
      ? activeRows.reduce((s, r) => s + r.dau, 0) / activeRows.length
      : 0;
    const avgReturningPct = activeRows.length
      ? activeRows.reduce((s, r) => s + (r.returningPct ?? 0), 0) / activeRows.length
      : 0;

    // Yesterday mission distribution
    const ydayRow = dailyRows.find((r) => r.date === dateTo);
    const missionDist = ydayRow
      ? {
          m1: ydayRow.mission1,
          m2: ydayRow.mission2,
          m3: ydayRow.mission3,
          m4: ydayRow.mission4,
          m5: ydayRow.mission5,
          m6plus: ydayRow.mission6plus,
          total:
            ydayRow.mission1 +
            ydayRow.mission2 +
            ydayRow.mission3 +
            ydayRow.mission4 +
            ydayRow.mission5 +
            ydayRow.mission6plus,
        }
      : { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6plus: 0, total: 0 };

    const rateRow = result.rate[0] ?? { new_total: 0, new_verified: 0 };
    const newUserQuality = {
      newTotal: rateRow.new_total,
      newVerified: rateRow.new_verified,
      newVerifiedRate: rateRow.new_total > 0 ? rateRow.new_verified / rateRow.new_total : null,
    };

    const socialCounts = {
      total: 0, // caller fills this (UserProfiles scan)
      x: walletsX.length,
      google: walletsGoogle.length,
      telegram: walletsTelegram.length,
      any: walletsAny.length,
      multi: 0, // caller-side derived (requires Set intersection we don't have here)
    };

    return c.json({
      dateFrom,
      dateTo,
      reportBaseDate: dateTo,
      today,
      daily: dailyRows,
      socialCounts,
      newUserQuality,
      topActivities: result.top.map((r: any) => ({
        category: r.category,
        uniqueUsers: r.unique_users,
      })),
      catStats: result.catstat.map((r: any) => ({
        category: r.category,
        total: r.total,
        verified: r.verified,
        returning: r.returning,
        retentionD1: r.retention_d1,
      })),
      grpStats: [
        {
          group: 'DEX',
          total: result.dexGrp[0]?.total ?? 0,
          verified: result.dexGrp[0]?.verified ?? 0,
          returning: result.dexGrp[0]?.returning ?? 0,
          retentionD1: result.dexGrp[0]?.retention_d1 ?? 0,
        },
        {
          group: 'GAMES',
          total: result.gamesGrp[0]?.total ?? 0,
          verified: result.gamesGrp[0]?.verified ?? 0,
          returning: result.gamesGrp[0]?.returning ?? 0,
          retentionD1: result.gamesGrp[0]?.retention_d1 ?? 0,
        },
      ],
      missionDist,
      peakDau: peak ? { date: peak.date, dau: peak.dau } : null,
      avgDau: Math.round(avgDau),
      avgReturningPct: Number(avgReturningPct.toFixed(1)),
      activeDays: activeRows.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('nasun-metrics query failed:', err);
    return c.json({ error: 'query_failed' }, 500);
  }
});

export default app;
