/**
 * Stage 2 - identity_map reconcile gate (§3.3 cutover gate analysis).
 *
 * The coverage report (export-identity-map.ts --phase report) shows ~2,218
 * UserProfiles whose identityId is not in identity_map. The strict gate says
 * "uncovered must be 0 or explained". This script EXPLAINS the uncovered set:
 * for each uncovered profile it answers two questions that decide whether the
 * cutover can proceed without data loss:
 *
 *   (a) Re-auth path: does the profile carry a wallet whose developer credential
 *       (nasun_/metamask_{addr}) IS in identity_map? If so the user can still log
 *       back in via that wallet (mapping to SOME identityId) -> not truly orphaned;
 *       it's a dual-identity (the profile sits on the Google-federated identityId,
 *       the wallet authenticates into a different developer identityId).
 *   (b) Recoverable data: points are wallet-anchored (survive any identityId
 *       change, FINAL plan §1.3) so they are never lost here. What an uncovered
 *       identityId loses at cutover is PROFILE metadata (linkedAccounts/social).
 *       So we report the linkedAccounts-key distribution of the uncovered set.
 *
 * Read-only against the local SQLite snapshot. No AWS, no prod writes. Counts /
 * aggregates only (PII: never print addresses, subs, identityIds, or rows).
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   npx tsx src/scripts/reconcile-identity-map.ts --db /tmp/identity_map.sqlite
 */

import Database from 'better-sqlite3';

const argv = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
const DB_PATH = arg('--db', '/tmp/identity_map.sqlite');

const db = new Database(DB_PATH, { readonly: true });
const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

// An uncovered profile = a UserProfiles row whose identityId is absent from identity_map.
const UNCOVERED = `user_profile p WHERE NOT EXISTS
  (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id)`;

const total = n('SELECT COUNT(*) AS n FROM user_profile');
const uncovered = n(`SELECT COUNT(*) AS n FROM ${UNCOVERED}`);

// (1) uncovered split by whether the profile carries ANY wallet address
//     (top-level walletAddress OR nested linkedAccounts address -> profile_address).
const uncoveredWithAddr = n(`SELECT COUNT(*) AS n FROM ${UNCOVERED}
  AND EXISTS (SELECT 1 FROM profile_address pa WHERE pa.identity_id = p.identity_id)`);
const uncoveredNoAddr = uncovered - uncoveredWithAddr;

// (2) of uncovered-with-address: how many carry a wallet whose developer
//     credential is in identity_map (nasun_ or metamask_) -> re-auth path exists.
const reauthable = n(`SELECT COUNT(DISTINCT p.identity_id) AS n
  FROM user_profile p
  JOIN profile_address pa ON pa.identity_id = p.identity_id
  JOIN identity_map m2 ON (m2.developer_user_identifier = 'nasun_' || pa.address
                        OR m2.developer_user_identifier = 'metamask_' || pa.address)
  WHERE NOT EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id)`);

// (3) dual-identity: uncovered profile whose wallet maps to a DIFFERENT (covered)
//     identityId via developer credential. (subset of reauthable where the mapped
//     identityId != the profile's own identityId - by definition true here, since
//     the profile's identityId is uncovered, so any mapped id differs.)
const dualIdentity = reauthable;

// (4) truly orphaned with a wallet but NO developer credential anywhere
//     (wallet exists on profile but is not a Cognito developer identity).
const orphanWithAddr = uncoveredWithAddr - reauthable;

// (5) linkedAccounts-key distribution of the uncovered set (what profile metadata
//     would be lost). Full distribution, not LIMITed.
const linkKeys = db
  .prepare(
    `SELECT p.linked_keys AS k, COUNT(*) AS c
     FROM user_profile p
     WHERE NOT EXISTS (SELECT 1 FROM identity_map m WHERE m.identity_id = p.identity_id)
     GROUP BY p.linked_keys ORDER BY c DESC`,
  )
  .all() as { k: string; c: number }[];

// (6) does any uncovered profile carry a SOCIAL link (x/twitter/telegram/google)
//     in its linkedAccounts keys -> recoverable social identity at stake.
const social = linkKeys
  .filter((r) => /x|twitter|telegram|google|discord/i.test(r.k || ''))
  .reduce((s, r) => s + r.c, 0);

const pct = (x: number) => (total ? ((x / total) * 100).toFixed(2) : '0.00');

console.log('=== identity_map reconcile gate (uncovered explained) ===');
console.log(`DB: ${DB_PATH}`);
console.log(`UserProfiles total            : ${total}`);
console.log(`uncovered (no map entry)      : ${uncovered} (${pct(uncovered)}%)`);
console.log('--- uncovered by wallet presence ---');
console.log(`  with a wallet address       : ${uncoveredWithAddr}`);
console.log(`  no wallet address at all    : ${uncoveredNoAddr}`);
console.log('--- recoverability of the wallet-bearing uncovered ---');
console.log(`  re-auth path (wallet cred in map, dual-identity) : ${reauthable}`);
console.log(`  orphan (wallet but NO developer credential)      : ${orphanWithAddr}`);
console.log('--- profile metadata at risk (linkedAccounts keys of uncovered) ---');
for (const r of linkKeys) console.log(`    ${(r.k || '[]').padEnd(40)} ${r.c}`);
console.log(`  uncovered carrying a SOCIAL link (x/tg/google/..) : ${social}`);
console.log('---');
console.log('NOTE: points are wallet-anchored (§1.3) -> NOT lost by an uncovered');
console.log('identityId. Points cross-ref vs nasun_points.activity_points is a');
console.log('separate step (needs the points ledger; deferred).');

db.close();
