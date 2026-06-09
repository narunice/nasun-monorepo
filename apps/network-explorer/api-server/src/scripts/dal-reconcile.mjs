// box Postgres <-> DynamoDB continuous reconciliation monitor (AWS-exit #4 DAL, S0).
//
// Read-only counterpart to dal-reload.mjs. Where dal-reload REBUILDS the box mirror
// from DynamoDB every 10 min, this script PROVES the mirror is faithful: it re-applies
// the *exact same* projection to a live DynamoDB scan and diffs the result against the
// live box tables along three axes -- count, key-set symmetric difference, and per-field
// value -- then classifies any drift as transient (staleness window) or persistent
// (survives a reload = real divergence). It is the keystone that turns "the box is
// hopefully right" into "the box is continuously proven right" before any write slice is
// de-Lambda'd onto box (delambda-plan S0 -> S1).
//
// SCOPE = the box read-mirror tables (verified live 2026-06-08):
//   public.user_profiles  <- DynamoDB UserProfiles
//   public.wallet_owner   <- DynamoDB UserWallets (identityId='WALLET_OWNER' sentinels)
//   public.user_wallets   <- DynamoDB UserWallets (per-identity rows; S1 wallet slice)
//
// SAFETY INVARIANTS:
//   - 100% READ-ONLY. box access uses the nasun_chat_ro role (SELECT-only, GRANT verified
//     live); DynamoDB access is Scan-only (EC2 instance role DalSyncScan). No DDL, no
//     INSERT, no DynamoDB write. user_wallets SELECT is granted to chat_ro by dal-reload's
//     swap (S1.0) solely so this monitor can diff it -- chat-server never queries it. The
//     issuer schema is never referenced (chat_ro has no grant on it -- verified session 13).
//   - PROJECTION PARITY. The JOBS map + omit() below are a verbatim mirror of
//     dal-reload.mjs. A startup source-parity guard SHA-256s the sibling dal-reload.mjs
//     and aborts if it diverges from RELOAD_ANCHOR_SHA256, forcing this mirror to be
//     re-reviewed whenever the sync mapping changes (the @nasun/standing JSON_ANCHOR
//     pattern). This keeps the comparison byte-for-byte on the same basis the live read
//     path already validated.
//   - TWO-PASS, RACE-PROOF COUNTS. The bulk pass (full DDB scan vs a box fingerprint
//     snapshot) only finds CANDIDATES; a 75s scan can cross the 10-min reload swap, so the
//     snapshot may be a stale generation and report cross-generation artifacts. A
//     confirmation pass then re-reads box (point SELECT) + DDB (BatchGet) for the candidate
//     keys at ~one instant and keeps only what STILL drifts -- artifacts resolve away, so
//     the reported counts are trustworthy regardless of mid-scan swaps.
//   - STALENESS-AWARE. box is a snapshot of DynamoDB as of the last reload swap; recent
//     organic churn (updatedAt bumps) shows as confirmed drift that the next reload clears.
//     Confirmed drift is only escalated to PERSISTENT when it survives a SUCCESSFUL
//     dal-reload across two monitor runs (cross-run state + ExecMainStatus/ExitTimestamp
//     gate), so the staleness window cannot raise a false alarm. updatedAt is NOT trusted
//     for classification (verify-telegram / the WALLET_OWNER sentinel do not bump it).
//   - LOW FOOTPRINT. The box side is held as a Map<pk, fingerprint> (a short hash of the
//     normalized columns), not full rows, so memory stays ~tens of MB even at 100k+ rows
//     -- this host also runs chat-server. Full rows are read only for candidate keys.
//
// Usage (on EC2, beside dal-reload):
//   RECON_DATABASE_URL='postgresql://nasun_chat_ro:<pw>@10.99.0.1:5432/nasun_dal?sslmode=require' \
//     node dal-reconcile.mjs            # one pass: report + exit 1 iff persistent drift
//   ... node dal-reconcile.mjs --json   # machine-readable report on stdout
//   ... node dal-reconcile.mjs --sample 50

import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const DB_URL = process.env.RECON_DATABASE_URL;
const AS_JSON = process.argv.includes('--json');
const SAMPLE = (() => {
  const i = process.argv.indexOf('--sample');
  if (i < 0) return 20;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isNaN(n) ? 20 : Math.max(0, n); // bad/missing value -> default, not silent 0
})();
// A successful dal-reload completes well within its 10-min timer; if the last success is
// older than this the mirror is rotting (timer down / crash-loop) -> a RED signal in its
// own right, independent of drift classification.
const STALE_RELOAD_MS = 25 * 60 * 1000;

const STATE_PATH = join(HERE, 'recon-state.json');
const REPORT_PATH = join(HERE, 'recon-report.json');
const RELOAD_PATH = join(HERE, 'dal-reload.mjs');
// SHA-256 of dal-reload.mjs @ S2.C by-identity parity (is_telegram_member ?? null + staging
// nullable; == EC2 deployed 2026-06-09). The only mapping change since the prior anchor is
// is_telegram_member's null-for-never-connected; the bool fingerprint here normalizes
// null==false==absent (see fp()), so the reconcile projection below still mirrors dal-reload
// with no functional change. If dal-reload.mjs changes again, re-mirror JOBS/omit and update this.
const RELOAD_ANCHOR_SHA256 = '7f9da26c340b441b87af1f8a788c98d5e29db433e70c654dfd985d226178a598';

if (!DB_URL) {
  console.error('FATAL: RECON_DATABASE_URL is required (read role over wg, e.g. nasun_chat_ro@10.99.0.1)');
  process.exit(1);
}

// ---- source-parity guard: abort if dal-reload's mapping drifted from this mirror ----
function assertReloadParity() {
  let src;
  try {
    src = readFileSync(RELOAD_PATH);
  } catch (e) {
    console.error(`FATAL: cannot read sibling dal-reload.mjs for parity check (${e?.code || e?.message}).`);
    process.exit(1);
  }
  const got = createHash('sha256').update(src).digest('hex');
  if (got !== RELOAD_ANCHOR_SHA256) {
    console.error(
      'FATAL: dal-reload.mjs changed (sha256 mismatch).\n' +
      `  expected ${RELOAD_ANCHOR_SHA256}\n  actual   ${got}\n` +
      '  The reconciliation projection below mirrors dal-reload. Re-review JOBS/omit\n' +
      '  against the new dal-reload.mjs, then update RELOAD_ANCHOR_SHA256.',
    );
    process.exit(1);
  }
}

// ============================================================================
// MIRROR of dal-reload.mjs (S1.0). Keep verbatim; the parity guard enforces it.
// ============================================================================
const omit = (it, keys) => {
  const o = { ...it };
  for (const k of keys) delete o[k];
  return Object.keys(o).length ? o : null;
};

// Composite-PK support. A table's pk may be one column (string) or several (array);
// every row's identity flows through a single string key so the bulk-scan and
// confirmation passes stay key-shape-agnostic. NUL joins the parts -- no identityId or
// wallet_address ever contains it.
const KEY_SEP = '\u0000';
const pkCols = (meta) => (Array.isArray(meta.pk) ? meta.pk : [meta.pk]);
const keyOf = (row, meta) => pkCols(meta).map((c) => row[c]).join(KEY_SEP);
const keyVals = (k) => k.split(KEY_SEP);

const JOBS = {
  user_profiles: {
    source: 'UserProfiles',
    required: ['identity_id'],
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
    filter: (it) => it.identityId === 'WALLET_OWNER',
    noAttributes: true,
    required: ['wallet_address', 'owner_identity_id'],
    promoted: ['identityId', 'walletAddress', 'ownerIdentityId', 'updatedAt'],
    row: (it) => ({
      wallet_address: it.walletAddress,
      owner_identity_id: it.ownerIdentityId,
      updated_at: it.updatedAt ?? null,
    }),
  },
  user_wallets: {
    source: 'UserWallets',
    filter: (it) => it.identityId !== 'WALLET_OWNER',
    required: ['identity_id', 'wallet_address'],
    promoted: ['identityId', 'walletAddress', 'updatedAt'],
    row: (it) => ({
      identity_id: it.identityId,
      wallet_address: it.walletAddress,
      updated_at: it.updatedAt ?? null,
    }),
  },
};
// ============================================================================

// Per-table comparison metadata: the PK column(s), the non-PK columns to fingerprint
// (in fixed order so box and DDB hash identically), per-type normalization sets, and
// the dangling self-ref column to NULL in parity with dal-reload.mjs:188. ddbKey maps
// the array of PK-column values (in pk order) to the DynamoDB key.
const META = {
  user_profiles: {
    pk: 'identity_id',
    cols: ['wallet_address', 'twitter_handle', 'twitter_id', 'telegram_user_id', 'is_telegram_member', 'linked_accounts', 'linked_to_primary_id', 'updated_at', 'created_at', 'attributes'],
    ts: new Set(['updated_at', 'created_at']),
    bool: new Set(['is_telegram_member']),
    json: new Set(['linked_accounts', 'attributes']),
    dangling: 'linked_to_primary_id',
    ddbKey: ([id]) => ({ identityId: id }), // UserProfiles PK
  },
  wallet_owner: {
    pk: 'wallet_address',
    cols: ['owner_identity_id', 'updated_at'],
    ts: new Set(['updated_at']),
    bool: new Set(),
    json: new Set(),
    dangling: null,
    ddbKey: ([wa]) => ({ identityId: 'WALLET_OWNER', walletAddress: wa }), // UserWallets sentinel PK+SK
  },
  user_wallets: {
    pk: ['identity_id', 'wallet_address'],
    // created_at is intentionally NOT compared: DynamoDB UserWallets has no createdAt, so
    // dal-reload lets the column take its DEFAULT now() and it can never match. attributes
    // ({blockchain,registeredAt}) + updated_at are the only mirrored non-PK columns.
    cols: ['attributes', 'updated_at'],
    ts: new Set(['updated_at']),
    bool: new Set(),
    json: new Set(['attributes']),
    dangling: null,
    ddbKey: ([id, wa]) => ({ identityId: id, walletAddress: wa }), // UserWallets PK+SK
  },
};

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

// Stable, key-sorted serialization. Mirrors JSON.stringify semantics (so a JS Set ->
// '{}' exactly as postgres.js stored it when dal-reload inserted the JSONB), making the
// box value and the DynamoDB-projected value canonicalize identically.
function stable(v) {
  if (v === null || v === undefined) return 'null';
  // A DynamoDB Number outside +/-2^53 unmarshals to BigInt; JSON.stringify would throw.
  // Render deterministically so a single such attribute cannot abort the whole run.
  if (typeof v === 'bigint') return v.toString();
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

function toEpoch(v) {
  if (v == null) return 'null';
  if (v instanceof Date) return String(v.getTime());
  if (typeof v === 'number' || typeof v === 'bigint') return String(v); // numeric epoch, deterministic
  const t = Date.parse(v);
  return Number.isNaN(t) ? `INVALID:${v}` : String(t);
}

// Normalize one column value to a comparable string (box value and DDB-projected value
// land on the same representation: timestamps -> epoch ms, bool -> bool, JSONB -> sorted
// canonical, text -> string).
function norm(col, val, meta) {
  if (meta.ts.has(col)) return toEpoch(val);
  if (meta.bool.has(col)) return val == null ? 'false' : String(Boolean(val));
  if (meta.json.has(col)) return stable(val ?? null);
  return val == null ? 'NULL' : 'S' + String(val);
}

// Fingerprint of a row's non-PK columns (short hash; identical iff every normalized
// column matches). Used on both the box side and the DDB-projected side.
function fingerprint(row, meta) {
  const h = createHash('sha256');
  for (const col of meta.cols) h.update(col + '=' + norm(col, row[col], meta) + '\n');
  return h.digest('hex').slice(0, 16);
}

// Column-level diff for a drifting key (PK excluded), used only to enrich samples.
function compareRow(expected, boxRow, meta) {
  const diffs = [];
  for (const col of meta.cols) {
    if (norm(col, expected[col], meta) !== norm(col, boxRow[col], meta)) {
      diffs.push({ col, ddb: trunc(expected[col]), box: trunc(boxRow[col]) });
    }
  }
  return diffs;
}

function trunc(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}

const sql = postgres(DB_URL, {
  max: 2,
  idle_timeout: 20,
  connect_timeout: 15,
  prepare: false,
  onnotice: () => {},
  // Bound how long a read can hold ACCESS SHARE so it can never indefinitely block a
  // dal-reload swap (ACCESS EXCLUSIVE). Generous vs the ~few-second full read over wg.
  connection: { statement_timeout: '60000', lock_timeout: '15000', idle_in_transaction_session_timeout: '30000' },
});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// Stream the box table via cursor, keeping only Map<key, fingerprint> resident.
async function loadBoxFingerprints(table, meta) {
  const map = new Map();
  await sql`SELECT * FROM public.${sql(table)}`.cursor(5000, (rows) => {
    for (const r of rows) map.set(keyOf(r, meta), fingerprint(r, meta));
  });
  return map;
}

// Re-read box rows for a set of keys (current generation), as Map<key, row>.
async function boxRowsByKeys(table, meta, keys) {
  const map = new Map();
  const cols = pkCols(meta);
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    let rows;
    if (cols.length === 1) {
      rows = await sql`SELECT * FROM public.${sql(table)} WHERE ${sql(cols[0])} IN ${sql(chunk)}`;
    } else {
      // Composite PK: zip the parallel value arrays with unnest() and join, which is
      // robust regardless of how the driver renders a multi-column IN tuple list.
      const a = chunk.map((k) => keyVals(k)[0]);
      const b = chunk.map((k) => keyVals(k)[1]);
      rows = await sql`
        SELECT t.* FROM public.${sql(table)} t
        JOIN unnest(${a}::text[], ${b}::text[]) AS k(c0, c1)
          ON t.${sql(cols[0])} = k.c0 AND t.${sql(cols[1])} = k.c1`;
    }
    for (const r of rows) map.set(keyOf(r, meta), r);
  }
  return map;
}

// Re-read DDB items for a set of keys (current), projected exactly like the bulk scan, as
// Map<key, row>. ddbIds (full scan keyset) is the dangling-NULL existence oracle.
async function ddbRowsByKeys(job, meta, keys, ddbIds) {
  const map = new Map();
  for (let i = 0; i < keys.length; i += 100) {
    let request = { [job.source]: { Keys: keys.slice(i, i + 100).map((k) => meta.ddbKey(keyVals(k))) } };
    // UnprocessedKeys come back on a 200 (partial throttle) -- NOT a thrown error -- so
    // withRetry's backoff never sees them. Re-send with our own exponential backoff and a
    // hard cap so sustained throttling fails the cycle (exit 2) instead of busy-looping
    // and pinning the event loop on this chat-server host.
    for (let attempt = 0; request && request[job.source]?.Keys?.length; attempt++) {
      const res = await withRetry(() => ddb.send(new BatchGetCommand({ RequestItems: request })), `batchget ${job.source}`);
      for (const it of res.Responses?.[job.source] ?? []) {
        if (job.filter && !job.filter(it)) continue;
        const row = job.row(it);
        if (job.required.some((k) => row[k] == null)) continue;
        if (!job.noAttributes) row.attributes = omit(it, job.promoted);
        if (meta.dangling && row[meta.dangling] != null && ddbIds && !ddbIds.has(row[meta.dangling])) row[meta.dangling] = null;
        map.set(keyOf(row, meta), row);
      }
      request = res.UnprocessedKeys?.[job.source]?.Keys?.length ? res.UnprocessedKeys : null;
      if (request) {
        if (attempt >= 12) throw new Error(`batchget ${job.source}: UnprocessedKeys did not drain after ${attempt + 1} attempts`);
        await sleep(Math.min(250 * 2 ** attempt, 10000) + Math.floor(Math.random() * 150));
      }
    }
  }
  return map;
}

async function reconcileTable(table) {
  const job = JOBS[table];
  const meta = META[table];
  const boxFp = await loadBoxFingerprints(table, meta);

  // --- bulk pass: a full DDB scan vs the box fingerprint snapshot finds CANDIDATES.
  // Because the multi-second scan can cross a dal-reload swap (boxFp then being a stale
  // generation), candidates are a superset that the confirmation pass re-checks.
  const seen = new Set();
  const missingCand = []; // pks present in DDB-projection, absent in boxFp
  const fieldCand = [];   // pks whose DDB fingerprint != boxFp
  let scanned = 0;
  let skipped = 0;
  // DDB-scan keyset = existence oracle for dangling-NULL, mirroring dal-reload's
  // `linked_to_primary_id NOT IN (SELECT identity_id FROM staging)` (the scan IS staging).
  // Self-referencing rows are deferred until the full keyset is known.
  const ddbIds = meta.dangling ? new Set() : null;
  const deferred = [];

  const checkRow = (row) => {
    const key = keyOf(row, meta);
    const bfp = boxFp.get(key);
    if (bfp === undefined) { missingCand.push(key); return; }
    seen.add(key);
    if (fingerprint(row, meta) !== bfp) fieldCand.push(key);
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
      if (job.required.some((k) => row[k] == null)) { skipped++; continue; }
      if (!job.noAttributes) row.attributes = omit(it, job.promoted);
      scanned++;
      if (ddbIds) ddbIds.add(keyOf(row, meta));
      if (meta.dangling && row[meta.dangling] != null) { deferred.push(row); continue; }
      checkRow(row);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  for (const row of deferred) {
    if (!ddbIds.has(row[meta.dangling])) row[meta.dangling] = null;
    checkRow(row);
  }

  const extraCand = [];
  for (const key of boxFp.keys()) {
    if (!seen.has(key)) extraCand.push(key);
  }
  const candidateCounts = { missing_in_box: missingCand.length, extra_in_box: extraCand.length, field_mismatch: fieldCand.length };

  // --- confirmation pass: re-read box + DDB for the candidate keys at ~one instant and
  // keep only what STILL drifts now. This removes staleness / mid-scan-swap artifacts (a
  // candidate flagged against a stale boxFp generation resolves to no-diff once both
  // sides are re-read current). The candidate set is normally tiny, so this is cheap.
  const candKeys = [...new Set([...missingCand, ...extraCand, ...fieldCand])];
  const boxNow = await boxRowsByKeys(table, meta, candKeys);
  const ddbNow = await ddbRowsByKeys(job, meta, candKeys, ddbIds);

  const missing = [];
  const extra = [];
  const fieldKeys = [];
  const fieldSamples = [];
  for (const key of candKeys) {
    const b = boxNow.get(key);
    const d = ddbNow.get(key);
    if (d && !b) missing.push({ key });
    else if (!d && b) extra.push({ key });
    else if (d && b) {
      const diffs = compareRow(d, b, meta);
      if (diffs.length) {
        fieldKeys.push({ key, sig: 'field:' + fingerprint(d, meta) });
        if (fieldSamples.length < SAMPLE) fieldSamples.push({ key, diffs });
      }
    }
    // d && b both absent -> candidate resolved (transient), dropped.
  }

  return {
    box_count: boxFp.size,
    ddb_scanned: scanned,
    ddb_skipped: skipped,
    candidate_counts: candidateCounts,
    drift_counts: { missing_in_box: missing.length, extra_in_box: extra.length, field_mismatch: fieldKeys.length },
    missing,
    extra,
    fieldKeys,
    fieldSamples,
  };
}

// dal-reload service health: last completion epoch + whether it SUCCEEDED. The
// reload-between-runs gate must count only a SUCCESSFUL swap -- ExecMainExitTimestamp
// advances even when the run exited non-zero (sanity-gate FAIL / lock contention / no
// swap), so ExecMainStatus is checked too. Read-only systemctl query; both null if
// unavailable (then drift cannot be classified and we degrade rather than false-GREEN).
// `--timestamp=unix` renders ExecMainExitTimestamp as '@<seconds>' so parsing is
// timezone-independent (a plain human timestamp like 'Mon ... KST' would Date.parse to
// NaN on a non-UTC host); Date.parse is kept only as a fallback for older systemd.
function reloadHealth() {
  try {
    const out = execFileSync('systemctl', ['show', 'dal-reload.service', '--timestamp=unix', '-p', 'ExecMainExitTimestamp', '-p', 'ExecMainStatus'], {
      encoding: 'utf8',
    });
    const m = {};
    for (const line of out.split('\n')) { const i = line.indexOf('='); if (i > 0) m[line.slice(0, i)] = line.slice(i + 1).trim(); }
    const raw = m.ExecMainExitTimestamp || '';
    let epoch = null;
    if (raw.startsWith('@')) {
      const s = parseInt(raw.slice(1), 10);
      epoch = Number.isNaN(s) ? null : s * 1000;
    } else {
      const t = Date.parse(raw);
      epoch = Number.isNaN(t) ? null : t;
    }
    return { epoch, status: m.ExecMainStatus ?? null };
  } catch {
    return { epoch: null, status: null };
  }
}

// Classify this run's drift against prior state. persistent = the same key still drifts
// after a SUCCESSFUL dal-reload completed since it was first seen (and, for field drift,
// its DDB fingerprint is unchanged = not live churn). Everything else is transient/pending.
function classify(nowIso, results, prior, reloadTs, reloadSucceeded) {
  const nextState = { runAt: nowIso, reloadExit: reloadTs, drift: {} };
  const summary = {};
  for (const [table, r] of Object.entries(results)) {
    nextState.drift[table] = {};
    const priorTable = prior?.drift?.[table] || {};
    let persistent = 0;
    let transient = 0;
    const persistentSamples = [];
    const entries = [
      ...r.missing.map((e) => ['missing_in_box', e.key, 'missing_in_box']),
      ...r.extra.map((e) => ['extra_in_box', e.key, 'extra_in_box']),
      ...r.fieldKeys.map((e) => ['field_mismatch', e.key, e.sig]),
    ];
    for (const [kind, key, sig] of entries) {
      const was = priorTable[key];
      const firstSeenAt = was?.firstSeenAt || nowIso;
      const reloadSince = Boolean(reloadSucceeded && reloadTs && Date.parse(firstSeenAt) < reloadTs);
      const samePrior = Boolean(was && was.kind === kind && was.sig === sig);
      if (samePrior && reloadSince) {
        persistent++;
        if (persistentSamples.length < SAMPLE) persistentSamples.push({ kind, key });
      } else {
        transient++;
      }
      nextState.drift[table][key] = { kind, sig, firstSeenAt };
    }
    summary[table] = { persistent, transient, persistentSamples };
  }
  return { nextState, summary };
}

async function main() {
  assertReloadParity();
  const startedAt = Date.now();
  const nowIso = new Date(startedAt).toISOString();

  const before = reloadHealth(); // reload generation before the scan
  const results = {};
  for (const table of Object.keys(JOBS)) {
    results[table] = await reconcileTable(table);
  }
  const after = reloadHealth(); // ...and after

  // Best-effort note that a reload swap committed mid-run (boxFp then being a stale
  // generation vs the scan). This is purely informational now: the confirmation pass
  // re-reads box + DDB for every candidate, so cross-generation artifacts are already
  // filtered out of the reported counts. (Detection is itself unreliable -- while a
  // reload is mid-run, systemctl reports an empty ExecMainExitTimestamp -> before.epoch
  // null -- which is exactly why correctness must not depend on it.)
  const straddledSwap = before.epoch != null && after.epoch != null && before.epoch !== after.epoch;
  const reloadTs = after.epoch;
  const reloadSucceeded = after.status === '0';
  const reloadFresh = reloadTs != null && (startedAt - reloadTs) <= STALE_RELOAD_MS;
  const reloadHealthy = reloadSucceeded && reloadFresh;
  // Confirmed drift is trustworthy-classifiable as transient/persistent only when the
  // reload state is known. Otherwise confirmed drift is reported as unclassified
  // (degraded), never GREEN.
  const canClassify = reloadTs != null && after.status != null;

  let prior = null;
  let stateCorrupt = false;
  if (existsSync(STATE_PATH)) {
    try { prior = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { prior = null; stateCorrupt = true; }
  }
  const { nextState, summary } = classify(nowIso, results, prior, reloadTs, reloadSucceeded);

  let totalDrift = 0;
  let totalPersistent = 0;
  const tables = {};
  for (const [table, r] of Object.entries(results)) {
    const d = r.drift_counts;
    totalDrift += d.missing_in_box + d.extra_in_box + d.field_mismatch;
    totalPersistent += summary[table].persistent;
    tables[table] = {
      box_count: r.box_count,
      ddb_scanned: r.ddb_scanned,
      ddb_skipped: r.ddb_skipped,
      candidate_counts: r.candidate_counts,
      drift_counts: d,
      classification: { persistent: summary[table].persistent, transient: summary[table].transient },
      samples: {
        missing_in_box: r.missing.slice(0, SAMPLE),
        extra_in_box: r.extra.slice(0, SAMPLE),
        field_mismatch: r.fieldSamples,
        persistent: summary[table].persistentSamples,
      },
    };
  }

  // exit 0 = GREEN or all-transient (classifiable, reload healthy)
  // exit 1 = persistent drift (survived a successful reload)
  // exit 3 = degraded: confirmed drift present but reload state is unavailable/unknown so
  //          it cannot be classified transient/persistent -> needs a human, not GREEN.
  //          (A mid-run swap is no longer escalated here: the confirmation pass already
  //          re-reads box+DDB, so straddle artifacts are filtered, not counted.)
  let verdict = 'GREEN';
  let exitCode = 0;
  if (totalDrift > 0) {
    if (!canClassify) { verdict = 'DRIFT(unclassified)'; exitCode = 3; }
    else if (totalPersistent > 0) { verdict = 'DRIFT(persistent)'; exitCode = 1; }
    else { verdict = 'DRIFT(transient)'; }
  }

  const warnings = [];
  if (straddledSwap) warnings.push('run straddled a dal-reload swap (informational; candidates were re-confirmed against current box + DDB)');
  if (reloadTs == null || after.status == null) warnings.push('dal-reload state unavailable (systemctl) -- drift cannot be classified as transient/persistent');
  else {
    if (!reloadSucceeded) warnings.push(`last dal-reload did not succeed (ExecMainStatus=${after.status}) -- mirror may be stale`);
    if (!reloadFresh) warnings.push(`last successful dal-reload is stale (> ${Math.round(STALE_RELOAD_MS / 60000)}min) -- sync may be down`);
  }
  if (stateCorrupt) warnings.push('prior recon-state.json was unreadable; persistence baseline reset for this cycle');

  const report = {
    runAt: nowIso,
    durationMs: Date.now() - startedAt,
    region: REGION,
    reloadExit: reloadTs ? new Date(reloadTs).toISOString() : null,
    reloadStatus: after.status,
    reloadHealthy,
    straddledSwap,
    priorRunAt: prior?.runAt ?? null,
    verdict,
    total_drift: totalDrift,
    total_persistent: totalPersistent,
    warnings,
    tables,
  };

  // Atomic state write (temp + rename) so an interrupted write can't corrupt the
  // persistence baseline and silently mask drift on the next run.
  try { writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), { mode: 0o600 }); } catch (e) { console.warn(`  (could not write report: ${e?.message})`); }
  try {
    const tmp = STATE_PATH + '.tmp';
    writeFileSync(tmp, JSON.stringify(nextState), { mode: 0o600 });
    renameSync(tmp, STATE_PATH);
  } catch (e) { console.warn(`  (could not write state: ${e?.message})`); }

  if (AS_JSON) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(`dal-reconcile: ${verdict}  (drift=${totalDrift}, persistent=${totalPersistent}, ${report.durationMs}ms)`);
    console.log(`  reload last exit: ${report.reloadExit || 'unknown'} (status=${after.status ?? '?'}, healthy=${reloadHealthy})   prior run: ${report.priorRunAt || 'none (baseline)'}`);
    for (const w of warnings) console.warn(`  WARN: ${w}`);
    for (const [table, t] of Object.entries(tables)) {
      const d = t.drift_counts;
      const c = t.candidate_counts;
      console.log(`  ${table}: box=${t.box_count} ddb_scanned=${t.ddb_scanned} skipped=${t.ddb_skipped} | confirmed missing=${d.missing_in_box} extra=${d.extra_in_box} field=${d.field_mismatch} | persistent=${t.classification.persistent} transient=${t.classification.transient} | candidates(pre-confirm) m=${c.missing_in_box}/e=${c.extra_in_box}/f=${c.field_mismatch}`);
      for (const fm of t.samples.field_mismatch.slice(0, 5)) {
        const detail = fm.diffs ? fm.diffs.map((x) => `${x.col}(ddb=${x.ddb} box=${x.box})`).join(', ') : fm.note;
        console.log(`      field ${fm.key}: ${detail}`);
      }
      for (const m of t.samples.missing_in_box.slice(0, 5)) console.log(`      missing_in_box: ${m.key}`);
      for (const x of t.samples.extra_in_box.slice(0, 5)) console.log(`      extra_in_box: ${x.key}`);
    }
  }

  process.exitCode = exitCode;
}

main()
  .catch((e) => {
    console.error('FATAL:', e?.message || e);
    process.exitCode = 2;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
