/**
 * Stage 2 (③d + cutover gate #2) — load the Cognito identity_map into the
 * self-hosted issuer's `issuer.identity_map`, applying dual-identity canonical
 * resolution.
 *
 * WHY THIS EXISTS
 * ----------------
 * The issuer (server.mjs `POST /mint`) looks up `issuer.identity_map` to re-issue
 * the SAME opaque identityId a credential had under Cognito. That table is empty
 * until this loader fills it from the Stage 1 export (`identity_map.sqlite`,
 * produced by export-identity-map.ts). Without it, every post-cutover login mints
 * a fresh uuid and orphans the user's existing points / leaderboard / profile.
 *
 * CANONICAL RESOLUTION (design §A.4)
 * ----------------------------------
 * ~4.7k users hold TWO Cognito identities for one human: a Google-federated id
 * (where their google profile lives) and a wallet-developer id (where their
 * wallet's points live). To keep "one identity per human regardless of login
 * method", the design folds secondary -> primary via UserProfiles.linkedToPrimaryId
 * (get-user-profile/index.ts:387-398). This loader bakes that fold into the stored
 * identity_id at migration time, so the issuer just does a flat lookup.
 *
 * The linkedToPrimaryId mapping is NOT in identity_map.sqlite (the export only
 * captured wallet_address + linkedAccounts keys). It is read live from the DAL
 * `user_profiles` table (already loaded, FK reconstructed — session-4 verified),
 * so canonicalization reflects the freshest profile links at load time.
 *
 * ★ POINTS-SAFETY INVARIANT (the subtle part)
 * -------------------------------------------
 * Points are wallet-anchored and queried strictly by identity_id, with no wallet
 * fallback in /score (design §0.1, ecosystem.ts:410-594). They accrue to the
 * wallet-OWNER identity. So canonicalizing a credential whose source identity
 * *bears points* to a different primary would hide those points from that login.
 *
 * Therefore the safe rule, applied automatically when a points ledger is provided:
 *   canonicalize a credential ONLY IF its source identity has no points-ledger presence
 *   (flagged-only and sum-zero identities count as present). If the source has any
 *   presence, KEEP IT RAW (byte-equivalent to Cognito, points preserved). Point-less
 *   social credentials (e.g. google) still fold onto their primary — which may bear
 *   points — strictly improving their view. Cyclic or over-long linkedToPrimaryId
 *   chains are anomalies and are also kept raw (never folded onto a non-terminal id).
 * This never hides points and still unifies the common case. The dry-run reports
 * the point-mass that protection kept raw, so the cutover gate can review it.
 *
 * MODES
 * -----
 *   --self-test        : run in-memory scenarios validating the pure planner. No I/O.
 *   (default)          : dry-run — read sqlite + DAL (+ points), print the plan, write nothing.
 *   --commit           : perform the append-only load into issuer.identity_map.
 *   --mode raw|canonical (default canonical)
 *   --allow-append     : permit --commit onto a non-empty issuer.identity_map (default refuses,
 *                        since ON CONFLICT DO NOTHING would silently keep stale mappings).
 *
 * The loader is APPEND-ONLY (INSERT ... ON CONFLICT DO NOTHING) and idempotent;
 * re-running never re-points an existing credential. Run it as a DB superuser
 * (e.g. peer `postgres`) for the bulk load — the issuer role is SELECT+INSERT only.
 *
 * PII: prints counts / aggregates only. Never logs identityIds, wallet addresses,
 * subs, or rows (matches export-identity-map.ts / reconcile-identity-map.ts).
 *
 * Usage (on the box, /srv/nasun/app):
 *   cd apps/network-explorer/api-server
 *   # validate logic, no DB needed:
 *   node --import tsx src/scripts/load-issuer-identity-map.ts --self-test
 *   # dry-run (review the plan before the gate):
 *   DAL_DATABASE_URL=postgres://postgres@/nasun_dal \
 *   POINTS_DATABASE_URL=postgres://postgres@/nasun_points \
 *     node --import tsx src/scripts/load-issuer-identity-map.ts --sqlite /srv/nasun/restore/identity_map.sqlite
 *   # commit (cutover gate #2, explicit approval):
 *   ... same env ... --sqlite <path> --commit
 */

// `postgres` is a direct api-server dep. `better-sqlite3` is not declared here but
// resolves via the monorepo's shamefully-hoist (chat-server depends on it); the box
// installs chat-server alongside explorer-api, so it is present. Same pattern as
// export-identity-map.ts. This is a one-shot migration script, never imported at runtime.
import Database from 'better-sqlite3';
import postgres from 'postgres';

// ----------------------------- args ----------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const arg = (name: string, def?: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

const SELF_TEST = flag('--self-test');
const COMMIT = flag('--commit');
const MODE = (arg('--mode', 'canonical') as 'raw' | 'canonical');
const SQLITE_PATH = arg('--sqlite', '/srv/nasun/restore/identity_map.sqlite')!;
const DAL_URL = arg('--dal-url', process.env.DAL_DATABASE_URL);
const POINTS_URL = arg('--points-url', process.env.POINTS_DATABASE_URL);
const ALLOW_UNGUARDED = flag('--allow-unguarded-canon');
const ALLOW_APPEND = flag('--allow-append'); // permit --commit onto a non-empty issuer.identity_map
const BATCH = Number(arg('--batch', '2000'));
const MAX_DEPTH = 8; // linkedToPrimaryId chain guard

if (MODE !== 'raw' && MODE !== 'canonical') {
  console.error(`invalid --mode: ${MODE} (expected raw|canonical)`);
  process.exit(1);
}

// ----------------------------- types ---------------------------------------
interface CredRow {
  developer_user_identifier: string;
  identity_id: string;
  provider: string | null;
  cred_type: string | null;
  source: string | null;
}
interface PlannedRow {
  developer_user_identifier: string;
  identity_id: string; // canonical, or raw when protected / raw-mode
  provider: string | null;
  cred_type: string | null;
  source: string; // origin source, '+canon' suffix when the id was canonicalized
}
interface PlanStats {
  total: number;
  withProfile: number;
  withoutProfile: number;
  hasPrimaryLink: number; // source identity resolves through >=1 linkedToPrimaryId hop
  canonicalizedApplied: number; // identity_id actually changed in output
  collapses: number; // credentials whose source id != canonical id (would-merge)
  distinctSourceIds: number;
  distinctOutputIds: number;
  chainsDepthGt1: number;
  cyclesDetected: number;
  chainsTruncated: number; // chain longer than maxDepth — kept raw
  anomaliesKeptRaw: number; // cycle/truncated links left raw instead of folded to a bad id
  pointsChecked: boolean;
  pointsBearingKeptRaw: number; // source with any points-ledger presence, kept raw
  pointsMassKeptRaw: number; // non-flagged mass kept visible by that protection
}

// ------------------------- pure planner ------------------------------------
/**
 * Follow the linkedToPrimaryId chain to its terminal primary. Single hop matches
 * get-user-profile, but chains/cycles are data anomalies we resolve fully and
 * report rather than silently leaving inconsistent.
 */
export function resolveTerminal(
  id: string,
  primaryOf: Map<string, string>,
  maxDepth = MAX_DEPTH,
): { terminal: string; depth: number; cycle: boolean; truncated: boolean } {
  let cur = id;
  let depth = 0;
  const seen = new Set<string>([id]);
  while (primaryOf.has(cur)) {
    // Still has a parent after maxDepth hops: an over-long chain (data anomaly).
    // Report truncated so the caller keeps the credential raw rather than folding it
    // onto a non-terminal id.
    if (depth >= maxDepth) return { terminal: cur, depth, cycle: false, truncated: true };
    const next = primaryOf.get(cur)!;
    if (seen.has(next)) return { terminal: cur, depth, cycle: true, truncated: false };
    cur = next;
    seen.add(cur);
    depth++;
  }
  return { terminal: cur, depth, cycle: false, truncated: false };
}

/**
 * Build the planned (credential -> identity_id) rows.
 *
 * @param creds       raw credential->identityId rows from the sqlite export
 * @param primaryOf   identity_id -> linkedToPrimaryId (from DAL user_profiles)
 * @param profileIds  set of all identity_ids that have a UserProfiles row (diagnostics)
 * @param pointsMass  identity_id -> non-flagged point mass, or null if unavailable
 * @param mode        'raw' (byte-equivalent) or 'canonical' (fold via linkedToPrimaryId)
 */
export function planCanonicalization(
  creds: CredRow[],
  primaryOf: Map<string, string>,
  profileIds: Set<string>,
  pointsMass: Map<string, number> | null,
  mode: 'raw' | 'canonical',
): { rows: PlannedRow[]; stats: PlanStats } {
  const rows: PlannedRow[] = [];
  const srcIds = new Set<string>();
  const outIds = new Set<string>();
  const stats: PlanStats = {
    total: creds.length,
    withProfile: 0,
    withoutProfile: 0,
    hasPrimaryLink: 0,
    canonicalizedApplied: 0,
    collapses: 0,
    distinctSourceIds: 0,
    distinctOutputIds: 0,
    chainsDepthGt1: 0,
    cyclesDetected: 0,
    chainsTruncated: 0,
    anomaliesKeptRaw: 0,
    pointsChecked: pointsMass !== null,
    pointsBearingKeptRaw: 0,
    pointsMassKeptRaw: 0,
  };

  for (const c of creds) {
    const id = c.identity_id;
    srcIds.add(id);
    if (profileIds.has(id)) stats.withProfile++;
    else stats.withoutProfile++;

    let outId = id;
    let canonicalized = false;

    if (mode === 'canonical') {
      const { terminal, depth, cycle, truncated } = resolveTerminal(id, primaryOf);
      if (cycle) stats.cyclesDetected++;
      if (truncated) stats.chainsTruncated++;
      if (depth >= 1) stats.hasPrimaryLink++;
      if (depth > 1) stats.chainsDepthGt1++;

      // Only fold when resolution reached a true terminal. A cycle or an over-long chain
      // is a data anomaly: keep the credential raw rather than fold it onto an arbitrary
      // or non-terminal id (which would orphan data anchored under the real id).
      const resolved = !cycle && !truncated;
      if (terminal !== id && !resolved) {
        stats.anomaliesKeptRaw++;
      } else if (terminal !== id) {
        stats.collapses++;
        // Points-safety: if the source identity has ANY points-ledger presence (flagged
        // or sum-zero included), moving it would hide those points from this login's
        // /score view. Keep it raw. Only point-less credentials (e.g. social federations
        // whose points are wallet-anchored under a different identity) fold onto a primary.
        if (pointsMass !== null && pointsMass.has(id)) {
          stats.pointsBearingKeptRaw++;
          stats.pointsMassKeptRaw += pointsMass.get(id) ?? 0;
          // outId stays = id (raw, protected)
        } else {
          outId = terminal;
          canonicalized = true;
          stats.canonicalizedApplied++;
        }
      }
    }

    outIds.add(outId);
    rows.push({
      developer_user_identifier: c.developer_user_identifier,
      identity_id: outId,
      provider: c.provider,
      cred_type: c.cred_type,
      source: canonicalized ? `${c.source ?? 'unknown'}+canon` : (c.source ?? 'unknown'),
    });
  }

  stats.distinctSourceIds = srcIds.size;
  stats.distinctOutputIds = outIds.size;
  return { rows, stats };
}

function printStats(stats: PlanStats, mode: string): void {
  console.log('\n=== issuer.identity_map load plan ===');
  console.log(`mode                          : ${mode}`);
  console.log(`credentials (sqlite)          : ${stats.total}`);
  console.log(`  source id has a profile     : ${stats.withProfile}`);
  console.log(`  source id has NO profile    : ${stats.withoutProfile}`);
  console.log('--- canonicalization ---');
  console.log(`source id has primary link    : ${stats.hasPrimaryLink}`);
  console.log(`  multi-hop chains (depth>1)  : ${stats.chainsDepthGt1}`);
  console.log(`  cycles detected             : ${stats.cyclesDetected}`);
  console.log(`  over-long chains truncated  : ${stats.chainsTruncated}`);
  console.log(`anomalies kept RAW (cyc/trunc): ${stats.anomaliesKeptRaw}`);
  console.log(`would-collapse (id != canon)  : ${stats.collapses}`);
  console.log(`canonicalization APPLIED      : ${stats.canonicalizedApplied}`);
  console.log(`distinct source ids           : ${stats.distinctSourceIds}`);
  console.log(`distinct OUTPUT ids           : ${stats.distinctOutputIds}`);
  console.log('--- points-safety guard ---');
  console.log(`points ledger checked         : ${stats.pointsChecked ? 'yes' : 'NO (unverified)'}`);
  console.log(`points-bearing kept RAW       : ${stats.pointsBearingKeptRaw}`);
  console.log(`  non-flagged mass kept raw   : ${stats.pointsMassKeptRaw.toFixed(2)}`);
}

// ----------------------------- self-test -----------------------------------
function selfTest(): void {
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) { pass++; } else { fail++; console.error(`  FAIL: ${name}`); }
  };

  // Scenario credentials:
  //   WALLET 'nasun_w' -> D (wallet-owner, bears points)
  //   GOOGLE 'google:s'-> G (federated, no points)
  //   plain 'nasun_x'  -> X (no link, no points)
  const creds: CredRow[] = [
    { developer_user_identifier: 'nasun_w', identity_id: 'D', provider: 'nasun.io', cred_type: 'sui', source: 'lookup' },
    { developer_user_identifier: 'google:s', identity_id: 'G', provider: 'accounts.google.com', cred_type: 'google', source: 'zklogin_join' },
    { developer_user_identifier: 'nasun_x', identity_id: 'X', provider: 'nasun.io', cred_type: 'sui', source: 'lookup' },
  ];
  const profileIds = new Set(['D', 'G', 'X']);

  // --- Case B: wallet is primary (G -> D). Google should fold to D; wallet unchanged.
  {
    const primaryOf = new Map([['G', 'D']]);
    const pts = new Map([['D', 100]]); // only wallet identity bears points
    const { rows } = planCanonicalization(creds, primaryOf, profileIds, pts, 'canonical');
    const byCred = Object.fromEntries(rows.map((r) => [r.developer_user_identifier, r.identity_id]));
    check('B: google folds to wallet primary D', byCred['google:s'] === 'D');
    check('B: wallet stays D (its own primary)', byCred['nasun_w'] === 'D');
    check('B: unlinked stays X', byCred['nasun_x'] === 'X');
  }

  // --- Case A: google is primary (D -> G). Wallet bears points -> MUST stay raw (D).
  {
    const primaryOf = new Map([['D', 'G']]);
    const pts = new Map([['D', 100]]); // wallet identity bears points
    const { rows, stats } = planCanonicalization(creds, primaryOf, profileIds, pts, 'canonical');
    const byCred = Object.fromEntries(rows.map((r) => [r.developer_user_identifier, r.identity_id]));
    check('A: points-bearing wallet kept RAW (D, not G)', byCred['nasun_w'] === 'D');
    check('A: protection counted', stats.pointsBearingKeptRaw === 1);
    check('A: protected mass = 100', stats.pointsMassKeptRaw === 100);
    check('A: google has no link, stays G', byCred['google:s'] === 'G');
  }

  // --- Case A unguarded shape: no points ledger -> source bears unknown points.
  {
    const primaryOf = new Map([['D', 'G']]);
    const { rows, stats } = planCanonicalization(creds, primaryOf, profileIds, null, 'canonical');
    const byCred = Object.fromEntries(rows.map((r) => [r.developer_user_identifier, r.identity_id]));
    // Without a ledger the planner cannot protect; it applies canonical (caller gates this).
    check('unguarded: wallet canonicalized to G (no ledger)', byCred['nasun_w'] === 'G');
    check('unguarded: pointsChecked=false', stats.pointsChecked === false);
  }

  // --- chain depth>1 (A -> B -> C), no points: terminal is C, chain counted.
  {
    const chainCreds: CredRow[] = [
      { developer_user_identifier: 'nasun_a', identity_id: 'A', provider: null, cred_type: 'sui', source: 'lookup' },
    ];
    const primaryOf = new Map([['A', 'B'], ['B', 'C']]);
    const { rows, stats } = planCanonicalization(chainCreds, primaryOf, new Set(['A', 'B', 'C']), new Map(), 'canonical');
    check('chain: A resolves to terminal C', rows[0].identity_id === 'C');
    check('chain: depth>1 counted', stats.chainsDepthGt1 === 1);
  }

  // --- cycle (A -> B -> A): detected, terminates without infinite loop.
  {
    const cyc: CredRow[] = [
      { developer_user_identifier: 'nasun_a', identity_id: 'A', provider: null, cred_type: 'sui', source: 'lookup' },
    ];
    const primaryOf = new Map([['A', 'B'], ['B', 'A']]);
    const term = resolveTerminal('A', primaryOf);
    check('cycle: detected', term.cycle === true);
    const { rows, stats } = planCanonicalization(cyc, primaryOf, new Set(['A', 'B']), new Map(), 'canonical');
    check('cycle: counted', stats.cyclesDetected === 1);
    check('cycle: credential kept RAW (not folded to cycle member)', rows[0].identity_id === 'A');
    check('cycle: counted as anomaly kept raw', stats.anomaliesKeptRaw === 1);
    check('cycle: not canonicalized', stats.canonicalizedApplied === 0);
  }

  // --- over-long chain (> maxDepth): kept raw, reported truncated (not folded to mid-chain).
  {
    const longCred: CredRow[] = [
      { developer_user_identifier: 'nasun_a0', identity_id: 'A0', provider: null, cred_type: 'sui', source: 'lookup' },
    ];
    const primaryOf = new Map<string, string>();
    for (let i = 0; i < 9; i++) primaryOf.set(`A${i}`, `A${i + 1}`); // A0->A1->...->A9, exceeds MAX_DEPTH=8
    const term = resolveTerminal('A0', primaryOf);
    check('trunc: flagged truncated', term.truncated === true);
    const { rows, stats } = planCanonicalization(longCred, primaryOf, new Set(), new Map(), 'canonical');
    check('trunc: over-long chain kept RAW', rows[0].identity_id === 'A0');
    check('trunc: counted truncated', stats.chainsTruncated === 1);
    check('trunc: counted anomaly kept raw', stats.anomaliesKeptRaw === 1);
  }

  // --- points presence (flagged-only / sum-zero): present with non-flagged mass 0 still protected.
  {
    const primaryOf = new Map([['D', 'G']]); // Case A: wallet D would fold to google primary G
    const pts = new Map([['D', 0]]); // D present in ledger but non-flagged mass is 0
    const { rows, stats } = planCanonicalization(creds, primaryOf, profileIds, pts, 'canonical');
    const byCred = Object.fromEntries(rows.map((r) => [r.developer_user_identifier, r.identity_id]));
    check('presence: zero-mass-but-present wallet kept RAW (D)', byCred['nasun_w'] === 'D');
    check('presence: protection counted', stats.pointsBearingKeptRaw === 1);
    check('presence: mass kept raw = 0', stats.pointsMassKeptRaw === 0);
  }

  // --- raw mode: never changes any id even with links present.
  {
    const primaryOf = new Map([['G', 'D'], ['D', 'G']]);
    const { rows } = planCanonicalization(creds, primaryOf, profileIds, new Map(), 'raw');
    const byCred = Object.fromEntries(rows.map((r) => [r.developer_user_identifier, r.identity_id]));
    check('raw: google stays G', byCred['google:s'] === 'G');
    check('raw: wallet stays D', byCred['nasun_w'] === 'D');
  }

  // --- source suffixing: canonicalized rows tagged '+canon'.
  {
    const primaryOf = new Map([['G', 'D']]);
    const { rows } = planCanonicalization(creds, primaryOf, profileIds, new Map([['D', 0]]), 'canonical');
    const g = rows.find((r) => r.developer_user_identifier === 'google:s')!;
    check('suffix: canonicalized source tagged +canon', g.source === 'zklogin_join+canon');
    const w = rows.find((r) => r.developer_user_identifier === 'nasun_w')!;
    check('suffix: unchanged source untagged', w.source === 'lookup');
  }

  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ----------------------------- main I/O ------------------------------------
async function main(): Promise<void> {
  if (SELF_TEST) return selfTest();

  if (!DAL_URL) {
    console.error('DAL_DATABASE_URL (or --dal-url) is required for the DAL user_profiles lookup');
    process.exit(1);
  }

  // 1) read the credential -> identityId map from the Stage 1 sqlite export.
  const sdb = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });
  const creds = sdb
    .prepare('SELECT developer_user_identifier, identity_id, provider, cred_type, source FROM identity_map')
    .all() as CredRow[];
  sdb.close();
  console.log(`sqlite: ${creds.length} credential mappings read from ${SQLITE_PATH}`);

  // 2) read linkedToPrimaryId + the profile id set from the DAL.
  const dal = postgres(DAL_URL, { max: 4 });
  const primaryOf = new Map<string, string>();
  const profileIds = new Set<string>();
  try {
    const links = (await dal`
      SELECT identity_id, linked_to_primary_id
      FROM user_profiles WHERE linked_to_primary_id IS NOT NULL`) as unknown as {
      identity_id: string;
      linked_to_primary_id: string;
    }[];
    for (const l of links) primaryOf.set(l.identity_id, l.linked_to_primary_id);
    const ids = (await dal`SELECT identity_id FROM user_profiles`) as unknown as { identity_id: string }[];
    for (const r of ids) profileIds.add(r.identity_id);
    console.log(`DAL: ${profileIds.size} profiles, ${primaryOf.size} linkedToPrimaryId links`);
  } catch (e) {
    console.error('FATAL: DAL read failed:', e instanceof Error ? e.message : e);
    await dal.end({ timeout: 5 });
    process.exit(1);
  }

  // 3) optional points ledger for the safety guard (per-identity non-flagged mass).
  let pointsMass: Map<string, number> | null = null;
  if (POINTS_URL) {
    const pts = postgres(POINTS_URL, { max: 4 });
    try {
      // Presence-inclusive of flagged / sum-zero identities: GROUP BY keys every identity
      // that has ANY activity_points row (only NULL identity_id is excluded), so
      // pointsMass.has(id) means "has ledger presence" and protects flagged-only or
      // signed-offsetting-to-zero identities too. The value is the non-flagged mass, used
      // for the report only (not the protection decision).
      const rows = (await pts`
        SELECT identity_id, COALESCE(SUM(final_points) FILTER (WHERE NOT flagged), 0) AS pts
        FROM activity_points
        WHERE identity_id IS NOT NULL
        GROUP BY identity_id`) as unknown as { identity_id: string; pts: string }[];
      pointsMass = new Map();
      for (const r of rows) pointsMass.set(r.identity_id, Number(r.pts));
      console.log(`points: ${pointsMass.size} identities with ledger presence loaded for safety guard`);
    } catch (e) {
      console.error('FATAL: points ledger read failed:', e instanceof Error ? e.message : e);
      await pts.end({ timeout: 5 });
      await dal.end({ timeout: 5 });
      process.exit(1);
    } finally {
      await pts.end({ timeout: 5 });
    }
  } else {
    console.warn('WARN: no POINTS_DATABASE_URL — points-safety guard cannot run (canonicalization unverified)');
  }

  // 4) build the plan.
  const { rows, stats } = planCanonicalization(creds, primaryOf, profileIds, pointsMass, MODE);
  printStats(stats, MODE);

  // 5) commit gate.
  if (!COMMIT) {
    console.log('\nDRY-RUN: no writes. Re-run with --commit to load (cutover gate #2, explicit approval).');
    await dal.end({ timeout: 5 });
    return;
  }

  if (MODE === 'canonical' && pointsMass === null && !ALLOW_UNGUARDED) {
    console.error(
      '\nREFUSING to commit canonical mode without a points ledger (cannot protect points).\n' +
        'Provide POINTS_DATABASE_URL, or use --mode raw (byte-equivalent), or --allow-unguarded-canon to override.',
    );
    await dal.end({ timeout: 5 });
    process.exit(1);
  }

  // Append-only re-runs keep existing rows (ON CONFLICT DO NOTHING), so a second commit
  // in a different mode would silently keep the OLD identity_ids and drop the new plan for
  // already-present credentials. A cutover load targets an empty issuer.identity_map;
  // refuse if it is already populated unless explicitly appending only-new credentials.
  const [{ total: existingTotal }] = (await dal`
    SELECT COUNT(*) AS total FROM issuer.identity_map`) as unknown as { total: string }[];
  if (Number(existingTotal) > 0 && !ALLOW_APPEND) {
    console.error(
      `\nREFUSING to commit: issuer.identity_map already has ${existingTotal} rows.\n` +
        'ON CONFLICT DO NOTHING keeps those existing identity_ids and silently drops the new\n' +
        'plan for any credential already present (e.g. a prior load in a different mode).\n' +
        'Investigate, or pass --allow-append to append only genuinely-new credentials.',
    );
    await dal.end({ timeout: 5 });
    process.exit(1);
  }

  console.log(`\nCOMMIT: appending ${rows.length} rows into issuer.identity_map (ON CONFLICT DO NOTHING)...`);
  let inserted = 0;
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const res = await dal`
        INSERT INTO issuer.identity_map ${dal(
          chunk,
          'developer_user_identifier',
          'identity_id',
          'provider',
          'cred_type',
          'source',
        )}
        ON CONFLICT (developer_user_identifier) DO NOTHING`;
      inserted += res.count;
      if ((i / BATCH) % 10 === 0) console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length} processed...`);
    }
    const [{ total }] = (await dal`SELECT COUNT(*) AS total FROM issuer.identity_map`) as unknown as {
      total: string;
    }[];
    console.log(`COMMIT done: ${inserted} new rows inserted (${rows.length - inserted} already present). issuer.identity_map total now ${total}.`);
  } catch (e) {
    console.error('FATAL: commit failed:', e instanceof Error ? e.message : e);
    await dal.end({ timeout: 5 });
    process.exit(1);
  }
  await dal.end({ timeout: 5 });
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
