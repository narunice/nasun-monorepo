/**
 * Stage 1 Track A - Cognito identity_map export (AWS-exit safety net).
 *
 * Captures the opaque Cognito identityId mapping BEFORE the defunct AWS account
 * (Gen Spectra, 466841130170) can be suspended. The self-hosted JWT issuer that
 * replaces Cognito must re-issue the SAME identityId per credential, so this map
 * (credential -> existing identityId) is a hard prerequisite for the cutover.
 * The 2026-06-03 backup README explicitly deferred this map as "optional"; the
 * FINAL migration plan (2026-06-05 §3) makes it mandatory. This script fills it.
 *
 * Read-only against AWS. Output is a local SQLite snapshot only (no prod writes).
 *
 * Cohorts (by each identity's Logins[]):
 *   developer (nasun.io)         -> lookup-developer-identity -> nasun_/metamask_/twitter_{id}
 *   federated accounts.google.com -> NOT lookable; recovered via ZkLoginUsers(sub->addr)
 *                                     join UserProfiles(walletAddress->identityId)
 *   federated api.twitter.com    -> legacy OAuth; NOT lookable (reported as gap)
 *   anonymous (empty Logins)     -> no profile, out of coverage scope
 *
 * Resumable: list-identities NextToken + DynamoDB Scan LastEvaluatedKey are
 * checkpointed in SQLite; the lookup phase uses a lookup_done table. Re-running
 * any phase continues where it left off.
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase status
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase enumerate
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase lookup --concurrency 6
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase scan-zklogin
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase scan-profiles
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase join
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase report
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/export-identity-map.ts --phase all
 *
 * PII: prints counts/aggregates only. Records (addresses, subs, ids) live only
 * in the SQLite file. Never dump rows to stdout.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import {
  CognitoIdentityClient,
  ListIdentitiesCommand,
  LookupDeveloperIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const POOL_ID =
  process.env.COGNITO_POOL_ID || 'ap-northeast-2:312bb111-8de7-4a61-95db-9a3c3fab58df';
const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const DEV_PROVIDER = 'nasun.io';
const DEFAULT_DB =
  '/mnt/d/nasun-aws-backup/prod-466841130170/cognito/identity_map.sqlite';

const argv = process.argv.slice(2);
const arg = (name: string, def?: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

const DB_PATH = arg('--db', DEFAULT_DB)!;
const PHASE = arg('--phase', 'status')!;
const CONCURRENCY = Number(arg('--concurrency', '6'));
const LIMIT = Number(arg('--limit', '0')); // 0 = no limit (lookup phase only)
const FORCE = argv.includes('--force'); // re-run a scan phase even if checkpoint is done

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 30000');

db.exec(`
  CREATE TABLE IF NOT EXISTS cognito_identity (
    identity_id TEXT PRIMARY KEY,
    logins      TEXT NOT NULL,   -- JSON array of provider names
    cohort      TEXT NOT NULL    -- developer|multi|google|twitter|anonymous|other
  );
  CREATE INDEX IF NOT EXISTS idx_cognito_cohort ON cognito_identity(cohort);

  CREATE TABLE IF NOT EXISTS identity_map (
    developer_user_identifier TEXT PRIMARY KEY,  -- nasun_/metamask_/twitter_{id} | google:{sub}
    identity_id TEXT NOT NULL,
    provider    TEXT NOT NULL,   -- nasun.io | accounts.google.com
    cred_type   TEXT NOT NULL,   -- sui|metamask|twitter|google|unknown
    source      TEXT NOT NULL    -- lookup | zklogin_join
  );
  CREATE INDEX IF NOT EXISTS idx_map_identity ON identity_map(identity_id);

  CREATE TABLE IF NOT EXISTS lookup_done (
    identity_id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS zklogin_user (
    provider TEXT NOT NULL,
    sub      TEXT NOT NULL,
    address  TEXT NOT NULL,
    PRIMARY KEY (provider, sub)
  );
  CREATE INDEX IF NOT EXISTS idx_zklogin_address ON zklogin_user(address);

  CREATE TABLE IF NOT EXISTS user_profile (
    identity_id    TEXT PRIMARY KEY,
    wallet_address TEXT,
    linked_keys    TEXT NOT NULL   -- JSON array of linkedAccounts keys (no values)
  );
  CREATE INDEX IF NOT EXISTS idx_profile_wallet ON user_profile(wallet_address);

  -- every wallet address a profile carries: top-level walletAddress + nested
  -- linkedAccounts[*].walletAddress. Pure-Google profiles have a null top-level
  -- walletAddress but their zkLogin address lives in linkedAccounts -> needed to
  -- join Google sub -> federated identityId.
  CREATE TABLE IF NOT EXISTS profile_address (
    identity_id TEXT NOT NULL,
    address     TEXT NOT NULL,
    PRIMARY KEY (identity_id, address)
  );
  CREATE INDEX IF NOT EXISTS idx_profile_address_addr ON profile_address(address);

  CREATE TABLE IF NOT EXISTS export_checkpoint (
    phase      TEXT PRIMARY KEY,
    next_token TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);

const cognito = new CognitoIdentityClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

function getCheckpoint(phase: string): { next_token: string | null; done: number } | undefined {
  return db
    .prepare('SELECT next_token, done FROM export_checkpoint WHERE phase = ?')
    .get(phase) as { next_token: string | null; done: number } | undefined;
}
function setCheckpoint(phase: string, nextToken: string | null, done: number): void {
  db.prepare(
    `INSERT INTO export_checkpoint(phase, next_token, done, updated_at) VALUES(?,?,?,?)
     ON CONFLICT(phase) DO UPDATE SET next_token=excluded.next_token, done=excluded.done, updated_at=excluded.updated_at`,
  ).run(phase, nextToken, done, Date.now());
}

function classifyCohort(logins: string[]): string {
  const hasDev = logins.includes(DEV_PROVIDER);
  const hasGoogle = logins.includes('accounts.google.com');
  const hasTwitter = logins.includes('api.twitter.com');
  if (logins.length === 0) return 'anonymous';
  if (hasDev && (hasGoogle || hasTwitter)) return 'multi';
  if (hasDev) return 'developer';
  if (hasGoogle && !hasTwitter) return 'google';
  if (hasTwitter && !hasGoogle) return 'twitter';
  return 'other';
}

function credType(devId: string): string {
  if (devId.startsWith('nasun_')) return 'sui';
  if (devId.startsWith('metamask_')) return 'metamask';
  if (devId.startsWith('twitter_')) return 'twitter';
  return 'unknown';
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let delay = 250;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const name = e?.name || '';
      const status = e?.$metadata?.httpStatusCode ?? 0;
      const retryable =
        name === 'TooManyRequestsException' ||
        name === 'ThrottlingException' ||
        name === 'LimitExceededException' ||
        name === 'ProvisionedThroughputExceededException' ||
        status === 429 ||
        status >= 500;
      if (!retryable || attempt >= 9) throw e;
      const jitter = Math.floor(Math.random() * 150);
      await sleep(delay + jitter);
      delay = Math.min(delay * 2, 10000);
      if (attempt >= 3) console.warn(`  [retry ${attempt}] ${label}: ${name || status}`);
    }
  }
}

// Phase 1: enumerate all pool identities + their Logins
async function phaseEnumerate(): Promise<void> {
  const ck = getCheckpoint('list_identities');
  if (ck?.done) {
    console.log(`enumerate: already complete (${count('cognito_identity')} identities)`);
    return;
  }
  let nextToken = ck?.next_token ?? undefined;
  const upsert = db.prepare(
    `INSERT INTO cognito_identity(identity_id, logins, cohort) VALUES(?,?,?)
     ON CONFLICT(identity_id) DO UPDATE SET logins=excluded.logins, cohort=excluded.cohort`,
  );
  let pages = 0;
  do {
    const res = await withRetry(
      () =>
        cognito.send(
          new ListIdentitiesCommand({ IdentityPoolId: POOL_ID, MaxResults: 60, NextToken: nextToken }),
        ),
      'list-identities',
    );
    const ids = res.Identities ?? [];
    db.transaction(() => {
      for (const id of ids) {
        const logins = id.Logins ?? [];
        upsert.run(id.IdentityId, JSON.stringify(logins), classifyCohort(logins));
      }
    })();
    nextToken = res.NextToken;
    setCheckpoint('list_identities', nextToken ?? null, nextToken ? 0 : 1);
    if (++pages % 50 === 0) console.log(`enumerate: ${count('cognito_identity')} identities so far...`);
  } while (nextToken);
  console.log(`enumerate done: ${count('cognito_identity')} identities`);
  reportCohorts();
}

function reportCohorts(): void {
  const rows = db
    .prepare('SELECT cohort, COUNT(*) AS n FROM cognito_identity GROUP BY cohort ORDER BY n DESC')
    .all() as { cohort: string; n: number }[];
  console.log('  cohort distribution:');
  for (const r of rows) console.log(`    ${r.cohort.padEnd(12)} ${r.n}`);
}

// Phase 2: lookup-developer-identity for developer/multi cohort
async function phaseLookup(): Promise<void> {
  const pending = db
    .prepare(
      `SELECT identity_id FROM cognito_identity
       WHERE cohort IN ('developer','multi')
         AND identity_id NOT IN (SELECT identity_id FROM lookup_done)
       ${LIMIT > 0 ? 'LIMIT ' + LIMIT : ''}`,
    )
    .all() as { identity_id: string }[];
  console.log(`lookup: ${pending.length} developer identities pending (concurrency ${CONCURRENCY})`);
  if (pending.length === 0) return;

  const insMap = db.prepare(
    `INSERT INTO identity_map(developer_user_identifier, identity_id, provider, cred_type, source)
     VALUES(?,?,?,?,'lookup')
     ON CONFLICT(developer_user_identifier) DO UPDATE SET identity_id=excluded.identity_id`,
  );
  const markDone = db.prepare('INSERT OR IGNORE INTO lookup_done(identity_id) VALUES(?)');

  let processed = 0;
  let i = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = i++;
      if (idx >= pending.length) return;
      const identityId = pending[idx].identity_id;
      const devIds: string[] = [];
      let token: string | undefined;
      do {
        const res = await withRetry(
          () =>
            cognito.send(
              new LookupDeveloperIdentityCommand({
                IdentityPoolId: POOL_ID,
                IdentityId: identityId,
                MaxResults: 60,
                NextToken: token,
              }),
            ),
          'lookup-developer-identity',
        );
        for (const d of res.DeveloperUserIdentifierList ?? []) devIds.push(d);
        token = res.NextToken;
      } while (token);
      db.transaction(() => {
        for (const d of devIds) insMap.run(d, identityId, DEV_PROVIDER, credType(d));
        markDone.run(identityId);
      })();
      if (++processed % 2000 === 0)
        console.log(`lookup: ${processed}/${pending.length} done, ${count('identity_map')} mappings`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  console.log(`lookup done: ${count('identity_map')} developer mappings`);
}

// Phase 3a: snapshot ZkLoginUsers (Google sub -> zkLogin address)
async function phaseScanZklogin(): Promise<void> {
  const ck = getCheckpoint('scan_zklogin');
  if (ck?.done) {
    console.log(`scan-zklogin: already complete (${count('zklogin_user')} rows)`);
    return;
  }
  let startKey = ck?.next_token ? JSON.parse(ck.next_token) : undefined;
  const upsert = db.prepare(
    `INSERT INTO zklogin_user(provider, sub, address) VALUES(?,?,?)
     ON CONFLICT(provider, sub) DO UPDATE SET address=excluded.address`,
  );
  do {
    const res = await withRetry(
      () =>
        ddb.send(
          new ScanCommand({
            TableName: 'ZkLoginUsers',
            ProjectionExpression: '#p, #s, #a',
            ExpressionAttributeNames: { '#p': 'provider', '#s': 'sub', '#a': 'address' },
            ExclusiveStartKey: startKey,
          }),
        ),
      'scan-zklogin',
    );
    db.transaction(() => {
      for (const it of res.Items ?? []) {
        if (it.sub && it.address)
          upsert.run(String(it.provider ?? 'google'), String(it.sub), String(it.address).toLowerCase());
      }
    })();
    startKey = res.LastEvaluatedKey;
    setCheckpoint('scan_zklogin', startKey ? JSON.stringify(startKey) : null, startKey ? 0 : 1);
  } while (startKey);
  console.log(`scan-zklogin done: ${count('zklogin_user')} zkLogin users`);
}

// Phase 3b: snapshot UserProfiles (walletAddress -> identityId, linkedAccounts keys)
async function phaseScanProfiles(): Promise<void> {
  if (FORCE) {
    setCheckpoint('scan_profiles', null, 0);
    db.exec('DELETE FROM profile_address');
  }
  const ck = getCheckpoint('scan_profiles');
  if (ck?.done) {
    console.log(`scan-profiles: already complete (${count('user_profile')} rows); use --force to re-scan`);
    return;
  }
  let startKey = ck?.next_token ? JSON.parse(ck.next_token) : undefined;
  const upsert = db.prepare(
    `INSERT INTO user_profile(identity_id, wallet_address, linked_keys) VALUES(?,?,?)
     ON CONFLICT(identity_id) DO UPDATE SET wallet_address=excluded.wallet_address, linked_keys=excluded.linked_keys`,
  );
  const insAddr = db.prepare(
    'INSERT OR IGNORE INTO profile_address(identity_id, address) VALUES(?,?)',
  );
  let pages = 0;
  do {
    const res = await withRetry(
      () =>
        ddb.send(
          new ScanCommand({
            TableName: 'UserProfiles',
            ProjectionExpression: 'identityId, walletAddress, linkedAccounts',
            ExclusiveStartKey: startKey,
          }),
        ),
      'scan-profiles',
    );
    db.transaction(() => {
      for (const it of res.Items ?? []) {
        if (!it.identityId) continue;
        const id = String(it.identityId);
        const top = it.walletAddress ? String(it.walletAddress).toLowerCase() : null;
        const linked = it.linkedAccounts && typeof it.linkedAccounts === 'object' ? it.linkedAccounts : {};
        upsert.run(id, top, JSON.stringify(Object.keys(linked)));
        // collect every wallet address this profile carries (top-level + nested)
        const addrs = new Set<string>();
        if (top) addrs.add(top);
        for (const v of Object.values(linked)) {
          if (v && typeof v === 'object') {
            const a = (v as any).walletAddress ?? (v as any).address;
            if (typeof a === 'string' && a.startsWith('0x')) addrs.add(a.toLowerCase());
          }
        }
        for (const a of addrs) insAddr.run(id, a);
      }
    })();
    startKey = res.LastEvaluatedKey;
    setCheckpoint('scan_profiles', startKey ? JSON.stringify(startKey) : null, startKey ? 0 : 1);
    if (++pages % 20 === 0) console.log(`scan-profiles: ${count('user_profile')} profiles so far...`);
  } while (startKey);
  console.log(`scan-profiles done: ${count('user_profile')} profiles, ${count('profile_address')} (identity,address) pairs`);
}

// Phase 3c: augment map with federated Google via zkLogin join
function phaseJoin(): void {
  const ins = db.prepare(
    `INSERT INTO identity_map(developer_user_identifier, identity_id, provider, cred_type, source)
     VALUES(?,?,?,?,'zklogin_join')
     ON CONFLICT(developer_user_identifier) DO UPDATE SET identity_id=excluded.identity_id, source=excluded.source`,
  );
  // Google-cohort profile PKs = the pure-Google federated identities to recover.
  const googleCohort = new Set(
    (
      db.prepare(`SELECT identity_id FROM cognito_identity WHERE cohort = 'google'`).all() as {
        identity_id: string;
      }[]
    ).map((r) => r.identity_id),
  );
  // Pass 1: top-level walletAddress match (covers users whose primary profile
  // carries the zkLogin address as its wallet, typically developer-cohort).
  const topJoin = db
    .prepare(
      `SELECT z.sub AS sub, p.identity_id AS iid
       FROM zklogin_user z JOIN user_profile p ON p.wallet_address = z.address
       WHERE z.provider = 'google'`,
    )
    .all() as { sub: string; iid: string }[];
  // Pass 2: any profile address (top-level + nested linkedAccounts), filtered in
  // JS to the Google-cohort PK. Kept as a 2-way join (same fast shape as pass 1)
  // because the 3-way SQL join through cognito_identity provokes a pathological
  // SQLite plan. Runs after pass 1 so the Google-cohort PK wins on conflict - it
  // is the identityId the user authenticates into via Google and whose data must
  // be preserved.
  const nestedJoin = (
    db
      .prepare(
        `SELECT z.sub AS sub, pa.identity_id AS iid
         FROM zklogin_user z JOIN profile_address pa ON pa.address = z.address
         WHERE z.provider = 'google'`,
      )
      .all() as { sub: string; iid: string }[]
  ).filter((r) => googleCohort.has(r.iid));
  db.transaction(() => {
    for (const r of topJoin) ins.run('google:' + r.sub, r.iid, 'accounts.google.com', 'google');
    for (const r of nestedJoin) ins.run('google:' + r.sub, r.iid, 'accounts.google.com', 'google');
  })();

  const unmatched = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM zklogin_user z
         WHERE z.provider='google'
           AND NOT EXISTS (SELECT 1 FROM profile_address pa WHERE pa.address = z.address)`,
      )
      .get() as { n: number }
  ).n;
  console.log(
    `join done: top-level ${topJoin.length}, nested(google-cohort) ${nestedJoin.length} mappings; ` +
      `${unmatched} zkLogin rows matched no profile address`,
  );
}

// Phase 4: coverage report (cutover gate)
function phaseReport(): void {
  const totalProfiles = count('user_profile');
  const g = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

  const covered = g(
    `SELECT COUNT(*) AS n FROM user_profile p
     WHERE EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id)`,
  );
  const byLookup = g(
    `SELECT COUNT(*) AS n FROM user_profile p
     WHERE EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id AND m.source='lookup')`,
  );
  const byJoinOnly = g(
    `SELECT COUNT(*) AS n FROM user_profile p
     WHERE EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id AND m.source='zklogin_join')
       AND NOT EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id AND m.source='lookup')`,
  );
  const uncovered = totalProfiles - covered;

  const pct = (n: number) => (totalProfiles ? ((n / totalProfiles) * 100).toFixed(2) : '0.00');
  console.log('\n=== identity_map coverage report ===');
  console.log(`DB: ${DB_PATH}`);
  console.log(`pool identities enumerated : ${count('cognito_identity')}`);
  console.log(`identity_map entries       : ${count('identity_map')} (lookup + join)`);
  console.log(`zkLogin users (Google)     : ${count('zklogin_user')}`);
  console.log(`UserProfiles (denominator) : ${totalProfiles}`);
  console.log('---');
  console.log(`covered profiles           : ${covered} (${pct(covered)}%)`);
  console.log(`  via developer lookup     : ${byLookup} (${pct(byLookup)}%)`);
  console.log(`  via Google zkLogin join  : ${byJoinOnly} (${pct(byJoinOnly)}%)`);
  console.log(`UNCOVERED profiles         : ${uncovered} (${pct(uncovered)}%)   <-- cutover gate: must be 0 or explained`);

  console.log('--- uncovered breakdown by wallet presence ---');
  const wb = db
    .prepare(
      `SELECT CASE WHEN p.wallet_address IS NULL THEN 'no_wallet' ELSE 'has_wallet' END AS k, COUNT(*) AS n
       FROM user_profile p
       WHERE NOT EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id)
       GROUP BY k ORDER BY n DESC`,
    )
    .all() as { k: string; n: number }[];
  for (const r of wb) console.log(`    ${r.k.padEnd(12)} ${r.n}`);

  console.log('--- uncovered breakdown by linkedAccounts keys ---');
  const lb = db
    .prepare(
      `SELECT p.linked_keys AS k, COUNT(*) AS n
       FROM user_profile p
       WHERE NOT EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id)
       GROUP BY p.linked_keys ORDER BY n DESC LIMIT 15`,
    )
    .all() as { k: string; n: number }[];
  for (const r of lb) console.log(`    ${(r.k || '[]').padEnd(40)} ${r.n}`);

  console.log('--- identity_map by cred_type ---');
  const ct = db
    .prepare('SELECT cred_type, COUNT(*) AS n FROM identity_map GROUP BY cred_type ORDER BY n DESC')
    .all() as { cred_type: string; n: number }[];
  for (const r of ct) console.log(`    ${r.cred_type.padEnd(12)} ${r.n}`);
}

function phaseStatus(): void {
  console.log(`DB: ${DB_PATH}`);
  console.log('row counts:');
  for (const t of ['cognito_identity', 'identity_map', 'lookup_done', 'zklogin_user', 'user_profile'])
    console.log(`  ${t.padEnd(18)} ${count(t)}`);
  const cks = db.prepare('SELECT phase, done, (next_token IS NOT NULL) AS has_token FROM export_checkpoint').all();
  console.log('checkpoints:', cks.length ? '' : '(none yet)');
  for (const c of cks as any[]) console.log(`  ${c.phase.padEnd(16)} done=${c.done} resumable=${c.has_token ? 'yes' : 'no'}`);
}

async function main(): Promise<void> {
  console.log(`pool=${POOL_ID} region=${REGION} phase=${PHASE}`);
  switch (PHASE) {
    case 'status':
      phaseStatus();
      break;
    case 'enumerate':
      await phaseEnumerate();
      break;
    case 'lookup':
      await phaseLookup();
      break;
    case 'scan-zklogin':
      await phaseScanZklogin();
      break;
    case 'scan-profiles':
      await phaseScanProfiles();
      break;
    case 'join':
      phaseJoin();
      break;
    case 'report':
      phaseReport();
      break;
    case 'all':
      await phaseEnumerate();
      await phaseLookup();
      await phaseScanZklogin();
      await phaseScanProfiles();
      phaseJoin();
      phaseReport();
      break;
    default:
      console.error(`unknown --phase: ${PHASE}`);
      process.exit(1);
  }
  db.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  db.close();
  process.exit(1);
});
