/**
 * LCK (LoL Champions Korea) prediction-market batch creator.
 *
 * Per spec, emits one binary series-level market per match:
 *   "🎮 LCK <blockName>: Will <HomeTeam> beat <AwayTeam>?" -> home_win
 *   closeTime = match start - 5min, resolveDeadline = match start + 7d.
 *
 * Specs are configured below; edit before running. matchId and team codes
 * must come from lolesports getSchedule. Pre-flight verification calls the
 * same endpoint and aborts if the match is missing or team codes do not
 * match what lolesports has registered (catches typos before on-chain).
 *
 * Lookup helper (no auth, public x-api-key constant):
 *   curl -H 'x-api-key: __REDACTED_LOL_API_KEY__' \
 *     'https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US&leagueId=98767991310872058' \
 *     | jq '.data.schedule.events[] | select(.state=="unstarted") | {startTime, matchId: .match.id, teams: [.match.teams[].code], bestOf: .match.strategy.count}'
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY            creator wallet
 *   PREDICTION_RESOLVER_KEY         keeper privkey (derives resolver address)
 *   PREDICTION_PACKAGE_ID           deployed package id
 *   PREDICTION_ADMIN_CAP            optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-lck-batch.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }
// Nasun devnet chain identifier. Verified post-RPC-init below; the string
// match above is a fast first check but does not catch a typo that points at
// a foreign chain on a non-mainnet hostname.
const EXPECTED_CHAIN_ID = '272218f1';

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
const LOLESPORTS_BASE = 'https://esports-api.lolesports.com/persisted/gw';
const LOLESPORTS_API_KEY = process.env.LOLESPORTS_API_KEY || '__REDACTED_LOL_API_KEY__';
const LCK_LEAGUE_ID = '98767991310872058';

/**
 * Edit this list before each run.
 *
 * - matchId: 17-19 digit numeric id from lolesports getSchedule
 * - homeTeamCode / awayTeamCode: short uppercase code from lolesports
 *     ("T1", "GEN", "HLE", "KT", "DK", "DRX", "BRO", "NS", "BFX", "FOX").
 *     Order determines question phrasing: YES = homeTeam wins the series.
 * - homeTeamName / awayTeamName: full display name. Verified against
 *     lolesports at pre-flight (case-insensitive).
 * - blockName: e.g. "Regular Season - Round 1", "Playoffs - Round 2".
 *     Shown in the question for context.
 * - matchStartUtc: scheduled start ("YYYY-MM-DD HH:mm:ss UTC").
 * - bestOf: 1, 3, or 5 (verified against lolesports strategy.count).
 */
interface Spec {
  matchId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  blockName: string;
  matchStartUtc: string;
  bestOf: 1 | 3 | 5;
}

const SPECS: Spec[] = [
  // Edit before running. Use the curl helper at the top of this file to list
  // upcoming LCK matches. First production batch should hold 1-2 matches only
  // until the resolver path is observed end-to-end at least once.
];

function parseUtc(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/.exec(s);
  if (!m) throw new Error(`bad UTC: ${s}`);
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}

function fmtUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function parseKeypair(s: string): Ed25519Keypair {
  if (s.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(s);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const clean = s.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('bad privkey');
  return Ed25519Keypair.fromSecretKey(Buffer.from(clean, 'hex'));
}

function requireEnv(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`${n} required`); process.exit(1); }
  return v;
}

function requireHex64(n: string, v: string): string {
  if (!HEX_64.test(v)) { console.error(`${n} must be 0x-32-byte hex`); process.exit(1); }
  return v.toLowerCase();
}

// ============================================================
// lolesports pre-flight verification
// ============================================================

interface ScheduleEventRaw {
  state?: string;
  match?: {
    id?: string;
    teams?: Array<{ code?: string; name?: string }>;
    strategy?: { count?: number };
  };
}

async function fetchSchedule(): Promise<ScheduleEventRaw[]> {
  const url = `${LOLESPORTS_BASE}/getSchedule?hl=en-US&leagueId=${LCK_LEAGUE_ID}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'x-api-key': LOLESPORTS_API_KEY },
  });
  if (!res.ok) throw new Error(`lolesports HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { schedule?: { events?: ScheduleEventRaw[] } } };
  return body.data?.schedule?.events ?? [];
}

async function verifySpec(spec: Spec, events: ScheduleEventRaw[]): Promise<void> {
  const ev = events.find((e) => e.match?.id === spec.matchId);
  if (!ev) {
    throw new Error(`matchId ${spec.matchId} not in lolesports schedule (within current window)`);
  }
  if (ev.state !== 'unstarted') {
    throw new Error(`matchId ${spec.matchId} state=${ev.state} (expected unstarted)`);
  }
  const teams = ev.match?.teams ?? [];
  if (teams.length !== 2) {
    throw new Error(`matchId ${spec.matchId} has teams.length=${teams.length}`);
  }
  const codes = teams.map((t) => (t.code ?? '').toUpperCase().trim());
  if (codes.includes('TBD')) {
    throw new Error(`matchId ${spec.matchId} has TBD teams (${codes.join(',')})`);
  }
  if (!codes.includes(spec.homeTeamCode)) {
    throw new Error(`homeTeamCode ${spec.homeTeamCode} not on match. lolesports has: ${codes.join(',')}`);
  }
  if (!codes.includes(spec.awayTeamCode)) {
    throw new Error(`awayTeamCode ${spec.awayTeamCode} not on match. lolesports has: ${codes.join(',')}`);
  }
  if (spec.homeTeamCode === spec.awayTeamCode) {
    throw new Error(`home and away codes identical: ${spec.homeTeamCode}`);
  }
  const homeRaw = teams.find((t) => (t.code ?? '').toUpperCase().trim() === spec.homeTeamCode);
  const awayRaw = teams.find((t) => (t.code ?? '').toUpperCase().trim() === spec.awayTeamCode);
  // Strict name check (matches UFC batch convention). lolesports always
  // returns team.name for non-TBD matches; a falsy value means the schedule
  // payload itself is degraded and the operator must investigate before any
  // on-chain create -- silently skipping the check could let a typo through.
  if (!homeRaw?.name) {
    throw new Error(`lolesports returned empty homeTeam name for code ${spec.homeTeamCode}`);
  }
  if (!awayRaw?.name) {
    throw new Error(`lolesports returned empty awayTeam name for code ${spec.awayTeamCode}`);
  }
  if (homeRaw.name.toLowerCase() !== spec.homeTeamName.toLowerCase()) {
    throw new Error(`homeTeamName mismatch: spec='${spec.homeTeamName}' lolesports='${homeRaw.name}'`);
  }
  if (awayRaw.name.toLowerCase() !== spec.awayTeamName.toLowerCase()) {
    throw new Error(`awayTeamName mismatch: spec='${spec.awayTeamName}' lolesports='${awayRaw.name}'`);
  }
  const schedBestOf = ev.match?.strategy?.count;
  if (schedBestOf !== spec.bestOf) {
    throw new Error(`bestOf mismatch: spec=${spec.bestOf} lolesports=${schedBestOf}`);
  }
}

// ============================================================
// Market build + chain submit
// ============================================================

interface Market {
  spec: Spec;
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildMarket(spec: Spec): Market {
  const matchStartMs = parseUtc(spec.matchStartUtc);
  // Bo5 LCK series typically run 2-3.5h. ResolveAfter is informational only
  // (the keeper polls every minute regardless), set conservatively past the
  // worst-case end. Close 5 min before start to bar inside-info windows.
  const expectedDurationMs = (spec.bestOf === 5 ? 4 : spec.bestOf === 3 ? 3 : 1) * 60 * 60_000;
  const resolveAfterMs = matchStartMs + expectedDurationMs;
  const closeTimeMs = matchStartMs - 5 * 60_000;
  // 7d deadline matches the UFC batch convention. Generous buffer so a
  // lolesports outage spanning hours still resolves naturally; the chain-
  // level cancel_expired_market refund is the safety net beyond that.
  const resolveDeadlineMs = matchStartMs + 7 * 24 * 60 * 60_000;
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) {
    throw new Error('deadline must be >= ResolveAfter + 30min');
  }
  const resolutionCriteria =
    `Kind: esports\n` +
    `Provider: lolesports\n` +
    `League: LCK\n` +
    `MatchId: ${spec.matchId}\n` +
    `HomeTeamCode: ${spec.homeTeamCode}\n` +
    `AwayTeamCode: ${spec.awayTeamCode}\n` +
    `HomeTeamName: ${spec.homeTeamName}\n` +
    `AwayTeamName: ${spec.awayTeamName}\n` +
    `BestOf: ${spec.bestOf}\n` +
    `Field: home_win\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n`;
  return {
    spec,
    question: `🎮 LCK ${spec.blockName}: Will ${spec.homeTeamName} beat ${spec.awayTeamName}?`,
    description:
      `Binary outcome on the official lolesports result of the LCK ${spec.blockName} series ` +
      `${spec.homeTeamName} vs ${spec.awayTeamName} (Best of ${spec.bestOf}, scheduled start ` +
      `${spec.matchStartUtc}). Resolves YES iff ${spec.homeTeamName} wins the series. Resolves ` +
      `NO iff ${spec.awayTeamName} wins. A forfeit, walkover, or match cancelled past the ` +
      `resolve deadline results in the market being auto-cancelled (refund).`,
    // Use the 'sports' category to land inside the existing Sports tab. The
    // frontend's canonical category list is crypto/space/music/sports/weather/
    // finance; an esports subcategory can be added in a follow-up frontend pass.
    resolutionSource:
      `${LOLESPORTS_BASE}/getSchedule?hl=en-US&leagueId=${LCK_LEAGUE_ID}`,
    resolutionCriteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

async function createOnChain(
  client: SuiClient, admin: Ed25519Keypair, packageId: string, cap: string,
  resolver: string, m: Market,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::prediction_market::create_market`,
        arguments: [
          tx.object(cap),
          tx.pure.string(m.question),
          tx.pure.string(m.description),
          tx.pure.string('sports'),
          tx.pure.string(m.resolutionSource),
          tx.pure.string(m.resolutionCriteria),
          tx.pure.u64(BigInt(m.closeTimeMs)),
          tx.pure.u64(BigInt(m.resolveDeadlineMs)),
          tx.pure.address(resolver),
          tx.object(CLOCK_ID),
        ],
      });
      const r = await client.signAndExecuteTransaction({
        signer: admin, transaction: tx,
        options: { showEffects: true, showObjectChanges: true },
      });
      if (r.effects?.status?.status !== 'success') {
        throw new Error(`TX failed: ${r.effects?.status?.error ?? '?'}`);
      }
      await client.waitForTransaction({ digest: r.digest });
      const obj = r.objectChanges?.find(
        (c): c is { type: 'created'; objectType: string; objectId: string } =>
          c.type === 'created' &&
          typeof (c as { objectType?: string }).objectType === 'string' &&
          (c as { objectType: string }).objectType.endsWith('::prediction_market::Market'),
      );
      if (!obj) throw new Error('Market not in objectChanges');
      return obj.objectId;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retriable = /not available for consumption|current version|ObjectVersionUnavailable|already locked|reference is not available|EquivocationDetected|HTTP (?:429|5\d\d)|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg);
      if (!retriable || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  if (SPECS.length === 0) {
    console.error('SPECS is empty. Edit create-lck-batch.ts to add matches.');
    process.exit(1);
  }

  console.log(`Fetching lolesports LCK schedule for pre-flight...`);
  const events = await fetchSchedule();
  console.log(`  ${events.length} schedule entries returned.`);
  console.log('');

  console.log(`Verifying ${SPECS.length} match(es) against lolesports...`);
  for (const spec of SPECS) {
    process.stdout.write(`  [${spec.homeTeamCode} vs ${spec.awayTeamCode} matchId=${spec.matchId}] `);
    try {
      await verifySpec(spec, events);
      console.log('OK');
    } catch (err) {
      console.log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
  console.log('');

  const markets = SPECS.map(buildMarket);
  for (const m of markets) {
    console.log(`--- LCK ${m.spec.blockName}: ${m.spec.homeTeamName} vs ${m.spec.awayTeamName} ---`);
    console.log(`  Q: ${m.question}`);
    console.log(`  closeTime: ${fmtUtc(m.closeTimeMs)}`);
    console.log(`  deadline:  ${fmtUtc(m.resolveDeadlineMs)}`);
    console.log(`  criteria:`);
    for (const ln of m.resolutionCriteria.split('\n').filter(Boolean)) console.log(`    ${ln}`);
    console.log('');
  }
  if (dry) { console.log('[DRY RUN]'); return; }

  const admin = parseKeypair(requireEnv('PREDICTION_ADMIN_KEY'));
  const adminAddr = admin.toSuiAddress().toLowerCase();
  const resolverKp = parseKeypair(requireEnv('PREDICTION_RESOLVER_KEY'));
  const resolver = resolverKp.toSuiAddress().toLowerCase();
  if (adminAddr === resolver) { console.error('admin == resolver'); process.exit(1); }
  if (process.env.PREDICTION_RESOLVER_ADDRESS &&
      requireHex64('PREDICTION_RESOLVER_ADDRESS', process.env.PREDICTION_RESOLVER_ADDRESS) !== resolver) {
    console.error('resolver address mismatch'); process.exit(1);
  }
  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const cap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);
  const client = new SuiClient({ url: RPC_URL });

  const chainId = await client.getChainIdentifier();
  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error(`chainId ${chainId} != expected ${EXPECTED_CHAIN_ID} (refusing)`);
    process.exit(1);
  }

  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== adminAddr) {
    console.error(`AdminCap not owned by admin (${capOwner})`); process.exit(1);
  }

  console.log(`Creating ${markets.length} market(s) (resolver=${resolver} derived)`);
  for (const m of markets) {
    process.stdout.write(`  [${m.spec.homeTeamCode} vs ${m.spec.awayTeamCode}] creating... `);
    try {
      const id = await createOnChain(client, admin, packageId, cap, resolver, m);
      console.log(id);
      await new Promise((r) => setTimeout(r, 4000));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
