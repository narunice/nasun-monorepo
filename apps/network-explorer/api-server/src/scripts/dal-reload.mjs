// DynamoDB -> nasun_dal Postgres tx-safe full reload (AWS-exit #4 DAL, prep-B / S2).
//
// Runs on prod EC2 (DynamoDB instance-profile creds) and writes to the self-hosted
// box Postgres over the WireGuard private net (10.99.0.1) as the sync writer role.
// Because dal-load.mjs is INSERT-only (ON CONFLICT DO NOTHING) it cannot refresh
// mutable rows; this script instead rebuilds each table in a `staging` schema and
// performs a single-transaction atomic swap so a post-flip chat-server never reads
// a half-built or empty table (the swap takes a sub-second ACCESS EXCLUSIVE lock;
// the expensive scan + load happens off the live table).
//
// Scope = P1 read-flip only: user_profiles + wallet_owner. These are the *only* two
// tables identity-resolver.ts reads (verified L122/281/320/423/577). P2 tables
// (lb_*/ecosystem/creator/nft/bug_reports/address_books) are intentionally NOT
// synced here; they belong to the P2 write cutover.
//
// SAFETY INVARIANTS:
//   - issuer schema (identity_map / zklogin_users) is NEVER touched. The sync role
//     has no grant on it (verified); this script never references it. Salt/identityId
//     continuity is owned by the issuer service, not by this mirror.
//   - No-loss column mapping is identical to dal-load.mjs (promoted typed columns +
//     `attributes` JSONB = source item minus promoted keys), so the mirror is byte-for-
//     byte equivalent to the initial load that identity-resolver already validated.
//   - Sanity gate: the swap aborts if staging shrank > SHRINK_TOL vs the live table
//     (guards against a throttled / partial scan nuking good data).
//
// Rollback: nothing here mutates DynamoDB or the issuer schema. If a swapped table is
// bad, the next cycle re-syncs it; the live P1 rollback is unsetting DAL_DATABASE_URL
// on chat-server (instant DynamoDB return). No `_old` copy is retained on purpose
// (it would collide on index names across generations, and the env toggle + sanity
// gate are the real safety net).
//
// Usage (on EC2):
//   DAL_SYNC_DATABASE_URL='postgresql://nasun_app:<pw>@10.99.0.1:5432/nasun_dal?sslmode=require' \
//     node dal-reload.mjs --dry-run     # build staging + report counts, no swap
//   DAL_SYNC_DATABASE_URL=... node dal-reload.mjs            # full reload + swap

import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const DB_URL = process.env.DAL_SYNC_DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 2000;
// Abort the swap if a freshly scanned table holds < (1 - SHRINK_TOL) of the live
// row count. DynamoDB ItemCount grows monotonically here (registrations only), so a
// shrink almost always means a partial/throttled scan, not real deletions.
const SHRINK_TOL = 0.05;

if (!DB_URL) {
  console.error('FATAL: DAL_SYNC_DATABASE_URL is required (write role over wg, e.g. nasun_app@10.99.0.1)');
  process.exit(1);
}

// ---- no-loss helpers (parity with /srv/nasun/dal-migrate/dal-load.mjs) ----
const omit = (it, keys) => {
  const o = { ...it };
  for (const k of keys) delete o[k];
  return Object.keys(o).length ? o : null;
};

// P1 jobs. `source` = DynamoDB table; `filter` runs on the unmarshalled item
// (DynamoDBDocumentClient returns plain JS, so no AttributeValue unmarshalling here).
// Column mapping copied verbatim from dal-load.mjs to preserve the validated shape.
const JOBS = {
  user_profiles: {
    source: 'UserProfiles',
    required: ['identity_id'], // NOT NULL columns — rows missing these are skipped, not aborted
    promoted: ['identityId', 'walletAddress', 'twitterHandle', 'twitterId', 'telegramUserId', 'isTelegramMember', 'linkedAccounts', 'linkedToPrimaryId', 'updatedAt', 'createdAt'],
    row: (it) => ({
      identity_id: it.identityId,
      wallet_address: it.walletAddress ?? null,
      twitter_handle: it.twitterHandle ?? null,
      twitter_id: it.twitterId ?? null,
      telegram_user_id: it.telegramUserId ?? null,
      is_telegram_member: it.isTelegramMember ?? false,
      linked_accounts: it.linkedAccounts ?? null,
      linked_to_primary_id: it.linkedToPrimaryId ?? null,
      updated_at: it.updatedAt ?? null,
      created_at: it.createdAt ?? null,
    }),
  },
  wallet_owner: {
    source: 'UserWallets',
    filter: (it) => it.identityId === 'WALLET_OWNER', // sentinel rows only
    noAttributes: true,
    required: ['wallet_address', 'owner_identity_id'], // NOT NULL columns
    promoted: ['identityId', 'walletAddress', 'ownerIdentityId', 'updatedAt'],
    row: (it) => ({
      wallet_address: it.walletAddress,
      owner_identity_id: it.ownerIdentityId,
      updated_at: it.updatedAt ?? null,
    }),
  },
};

// Exact current definition of public.v_wallet_primary_profile (captured from box,
// 2026-06-08). Recreated inside the swap tx because DROP TABLE removes the view.
const VIEW_DDL = `
CREATE VIEW public.v_wallet_primary_profile AS
  SELECT wo.wallet_address AS queried_wallet,
         pp.identity_id, pp.wallet_address, pp.twitter_handle, pp.twitter_id,
         pp.telegram_user_id, pp.is_telegram_member, pp.linked_accounts,
         pp.linked_to_primary_id, pp.attributes, pp.updated_at, pp.created_at
  FROM wallet_owner wo
  JOIN user_profiles up ON up.identity_id = wo.owner_identity_id
  JOIN user_profiles pp ON pp.identity_id = COALESCE(up.linked_to_primary_id, up.identity_id)`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  let delay = 250;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const name = e?.name || '';
      const status = e?.$metadata?.httpStatusCode ?? 0;
      const retryable =
        name === 'ThrottlingException' ||
        name === 'ProvisionedThroughputExceededException' ||
        name === 'TooManyRequestsException' ||
        status === 429 || status >= 500;
      if (!retryable || attempt >= 9) throw e;
      await sleep(delay + Math.floor(Math.random() * 150));
      delay = Math.min(delay * 2, 10000);
      if (attempt >= 3) console.warn(`  [retry ${attempt}] ${label}: ${name || status}`);
    }
  }
}

const sql = postgres(DB_URL, {
  max: 4,
  idle_timeout: 30,
  connect_timeout: 15,
  // Suppress routine NOTICEs (e.g. DROP TABLE IF EXISTS on an empty staging
  // schema) so the 10-min timer doesn't spam journald. Errors still throw.
  onnotice: () => {},
});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function buildStaging(name, job) {
  // Fresh staging table mirroring the live schema (columns, PK, partial indexes,
  // defaults, NOT NULL). LIKE never copies FOREIGN KEYs, so the self-FK is added
  // after the bulk load (validated once, all rows present) for user_profiles.
  await sql.unsafe(`DROP TABLE IF EXISTS staging.${name}`);
  await sql.unsafe(`CREATE TABLE staging.${name} (LIKE public.${name} INCLUDING ALL)`);

  let scanned = 0;
  let loaded = 0;
  let skipped = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const cols = Object.keys(batch[0]);
    const res = await sql`INSERT INTO ${sql('staging')}.${sql(name)} ${sql(batch, ...cols)} ON CONFLICT DO NOTHING`;
    loaded += res.count;
    batch = [];
  };

  let ExclusiveStartKey;
  do {
    const res = await withRetry(
      () => ddb.send(new ScanCommand({ TableName: job.source, ExclusiveStartKey })),
      `scan ${job.source}`,
    );
    for (const it of res.Items ?? []) {
      if (job.filter && !job.filter(it)) continue;
      const row = job.row(it);
      // Skip rows missing a NOT NULL column. A single such row would otherwise
      // abort the whole batch (ON CONFLICT DO NOTHING does not catch NOT NULL),
      // failing every sync cycle until the malformed source item is fixed.
      if (job.required.some((k) => row[k] == null)) { skipped++; continue; }
      if (!job.noAttributes) row.attributes = omit(it, job.promoted);
      batch.push(row);
      scanned++;
      if (batch.length >= BATCH) await flush();
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  await flush();

  if (name === 'user_profiles') {
    // Dangling self-refs (secondary points at a primary that is absent from the
    // scan) are NULLed — behavior-preserving: get-user-profile keeps the secondary
    // profile when the primary lookup misses. Then add the self-FK so the swapped
    // table matches the live constraint set.
    const danglers = await sql`
      UPDATE staging.user_profiles SET linked_to_primary_id = NULL
      WHERE linked_to_primary_id IS NOT NULL
        AND linked_to_primary_id NOT IN (SELECT identity_id FROM staging.user_profiles)`;
    if (danglers.count > 0) console.warn(`  ${name}: NULLed ${danglers.count} dangling linked_to_primary_id`);
    await sql.unsafe(
      `ALTER TABLE staging.user_profiles
         ADD CONSTRAINT user_profiles_linked_to_primary_id_fkey
         FOREIGN KEY (linked_to_primary_id) REFERENCES staging.user_profiles(identity_id)`,
    );
  }

  await sql.unsafe(`ANALYZE staging.${name}`);
  if (skipped > 0) console.warn(`  ${name}: skipped ${skipped} rows missing a NOT NULL column (${job.required.join('/')})`);
  console.log(`  ${name}: scanned=${scanned} loaded=${loaded} skipped=${skipped} (source=${job.source})`);
  return loaded;
}

async function liveCount(name) {
  const r = await sql.unsafe(`SELECT count(*)::int AS n FROM public.${name}`);
  return r[0].n;
}

// Session-level advisory lock so two overlapping runs cannot clobber each other's
// staging tables. systemd oneshot already serializes timer fires; this guards manual
// / ad-hoc invocations too. Auto-released when the connection ends.
const RELOAD_LOCK_KEY = 47302001;

async function main() {
  console.log(`dal-reload: region=${REGION} dry_run=${DRY_RUN}`);

  const [{ locked }] = await sql`SELECT pg_try_advisory_lock(${RELOAD_LOCK_KEY}) AS locked`;
  if (!locked) {
    console.error('FATAL: another dal-reload holds the advisory lock — exiting (no swap).');
    process.exitCode = 1;
    return;
  }

  const names = Object.keys(JOBS);

  const staged = {};
  for (const name of names) staged[name] = await buildStaging(name, JOBS[name]);

  // Sanity gate vs the live tables (abort the whole swap if any table shrank).
  let abort = false;
  for (const name of names) {
    const live = await liveCount(name);
    const floor = Math.floor(live * (1 - SHRINK_TOL));
    const ok = staged[name] >= floor;
    console.log(`  gate ${name}: staged=${staged[name]} live=${live} floor=${floor} ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) abort = true;
  }

  if (abort) {
    console.error('FATAL: sanity gate failed (staged shrank vs live) — NOT swapping. Staging left for inspection.');
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    console.log('dry-run: staging built + gate passed, skipping swap.');
    for (const name of names) await sql.unsafe(`DROP TABLE IF EXISTS staging.${name}`);
    return;
  }

  // Atomic swap. DROP the dependent view first, drop the live tables (their indexes
  // free the canonical names), move staging in, recreate the view, re-grant. The
  // GRANTs are the critical bit: dropping the table drops its ACLs, so chat-server's
  // nasun_chat_ro SELECT must be re-applied or a post-flip read 500s.
  await sql.begin(async (tx) => {
    await tx.unsafe('DROP VIEW IF EXISTS public.v_wallet_primary_profile');
    await tx.unsafe('DROP TABLE public.user_profiles');
    await tx.unsafe('DROP TABLE public.wallet_owner');
    await tx.unsafe('ALTER TABLE staging.user_profiles SET SCHEMA public');
    await tx.unsafe('ALTER TABLE staging.wallet_owner SET SCHEMA public');
    await tx.unsafe(VIEW_DDL);
    // Owner (nasun_app) keeps all privileges implicitly via SET SCHEMA. Re-grant the
    // reader roles explicitly (parity with pre-swap ACLs).
    await tx.unsafe('GRANT SELECT ON public.user_profiles, public.wallet_owner TO nasun_chat_ro, nasun_keeper');
    await tx.unsafe('GRANT SELECT ON public.v_wallet_primary_profile TO nasun_keeper');
  });

  const after = {};
  for (const name of names) after[name] = await liveCount(name);
  console.log(`swap committed: user_profiles=${after.user_profiles} wallet_owner=${after.wallet_owner}`);
}

main()
  .catch((e) => {
    console.error('FATAL:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
