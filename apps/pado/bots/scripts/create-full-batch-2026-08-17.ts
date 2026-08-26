/**
 * Prediction-market batch (2026-08-17, devnet v8 "V10-v8reset").
 *
 * Refills the 08-27 .. 09-19 calendar gap: of the 17 markets open on 2026-08-17,
 * 15 close between 08-21 and 08-26, leaving only two BNB markets (09-18, 09-22).
 *
 * Four auto-resolvable categories. Every identifier below was read out of the
 * exact upstream the keeper resolves with, on 2026-08-17, and is re-checkable
 * with --verify. No fabricated events.
 *   weather  (Open-Meteo archive)          -> 8
 *   sports   (TheSportsDB)                 -> 8  (Bundesliga / EPL)
 *   ufc      (ESPN core)                   -> 6
 *   space    (Launch Library 2, Go only)   -> 4
 *
 * Deliberate exclusions (2026-08-17):
 *   - esports/LCK: every LCK event after Week 13 (08-23) is Play-Ins or
 *     Playoffs with team code "TBD" on lolesports getSchedule. The resolver
 *     requires HomeTeamCode/AwayTeamCode, so the market cannot be specified
 *     until the bracket resolves.
 *   - crypto: the keeper prices these off a Binance live tick, so a late
 *     settlement judges the past with today's price. The two BNB markets
 *     already open (09-18, 09-22) cover the category.
 *   - stock: Twelve Data outputsize=5 means a session more than five trading
 *     days behind the settlement throws instead of resolving.
 *
 * Weather thresholds are calibrated on the same calendar window for 2019-2025
 * read from the Open-Meteo archive on 2026-08-17, and set near the 7-year
 * median so each market is genuinely uncertain (historical hit rate 3-4 of 7):
 *   Seoul  Tmax 08-28..09-02: 27.4 29.9 26.1 28.0 29.1 31.4 31.0  -> >29 C
 *   Tokyo  Tmax 08-30..09-04: 31.0 34.7 32.7 31.6 35.6 31.3 38.8  -> >33 C
 *   HCMC   rain 09-01..09-08: 82.0 83.3 120.1 91.6 102.4 106.7 180.6 -> >100 mm
 *   Seoul  rain 09-03..09-12: 129.2 131.6 53.6 189.4 15.4 48.6 128.6 -> >120 mm
 *   SIN    rain 09-05..09-14: 11.0 143.4 47.3 91.6 112.3 101.1 86.1 -> >90 mm
 *   NYC    Tmax 09-07..09-13: 31.9 27.3 29.3 28.0 35.3 27.5 27.4   -> >28 C
 *   Tokyo  rain 09-10..09-19: 45.1 59.2 37.2 46.8 5.8 50.2 94.3    -> >47 mm
 *   Seoul  Tmax 09-12..09-19: 27.5 25.6 28.4 31.4 28.3 31.0 28.6   -> >28.5 C
 * The archive was returning non-null daily values through 08-16 when this was
 * written (T-1d), so ResolveAfter = endDate + 36h has a wide margin.
 *
 * Canonical ids pinned from packages/devnet-config/devnet-ids.json
 * ("V10-v8reset"), re-read on 2026-08-17:
 *   package   0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9 (Immutable)
 *   AdminCap  0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac
 *             owned by admin 0x98f5339a... (keystore alias admin-v8)
 *   resolver  0x5cbc8390... (LIVE keeper wallet, distinct from creator)
 * The committed bots/.env is stale (v7), so package/cap/resolver are hardcoded
 * and the signer is loaded in-memory from ~/.sui/sui_config/sui.keystore (the
 * AdminCap owner). Do not pass --env-file.
 *
 * Every criteria block is self-validated against the real keeper parsers in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 * --verify additionally re-reads every upstream and aborts on identifier drift
 * (rescheduled fixture, reshuffled bout, launch slip). LL2 lookups are deduped
 * per launch id to stay inside the 15 req/hr free-tier quota.
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-08-17.ts --dry-run --verify
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-08-17.ts --verify   # live
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient, type SuiObjectChange } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';
import { parseWeatherCriteria } from '../lib/resolvers/weather.js';
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseUfcCriteria } from '../lib/resolvers/ufc.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const CANON_PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const CANON_ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
const CANON_RESOLVER = '0x5cbc8390ae709b0358f304fd76691dda1f03eae514a9592153125c8cff23aeb0';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

const ESPN_BASE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const LL2_BASE = 'https://ll.thespacedevs.com/2.2.0';

interface SportsSpec {
  kind: 'sports';
  label: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  field: 'home_win' | 'total_score_over';
  /** total_score_over threshold, e.g. 2.5. Ignored for home_win. */
  totalThreshold?: number;
}

interface UfcSpec {
  kind: 'ufc';
  label: string;
  eventId: string;
  competitionId: string;
  athleteAId: string;
  athleteBId: string;
  fighterA: string;
  fighterB: string;
  eventName: string;
  /** Card start, not bout start, so betting closes before the first walk. */
  fightStartUtc: string;
}

interface WeatherSpec {
  kind: 'weather';
  label: string;
  locationName: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  field: 'temperature_max_over' | 'precipitation_sum_over' | 'rainy_days_over';
  aggregation: 'max' | 'mean' | 'sum' | 'count';
  threshold: number;
  unit: string;
  closeUtc: string;
  resolveAfterUtc: string;
  deadlineUtc: string;
}

interface SpaceSpec {
  kind: 'space';
  label: string;
  launchId: string;         // LL2 UUID
  vehicle: string;          // display name, e.g. 'Falcon 9 (Starlink 17-52)'
  field: 'mission_success' | 'on_schedule_24h';
  netUtc: string;           // scheduled T-0 (UTC)
  resolveAfterUtc: string;  // read status after this (net + buffer)
  closeUtc: string;         // betting locks (before net)
  deadlineUtc: string;
}

type Spec = SportsSpec | UfcSpec | WeatherSpec | SpaceSpec;

/** on_schedule_24h tolerance; also the ScheduledNet comparison window. */
const ON_SCHEDULE_TOLERANCE_SEC = 86400;

// ===== batch definition =====
// Close dates are staggered 08-28 .. 09-19 so the board never empties again.
const SPECS: Spec[] = [
  // --- weather: Open-Meteo archive, thresholds calibrated in the header ---
  // Betting closes at the start of the observation window, so no observed day
  // is tradeable.
  {
    kind: 'weather', label: 'Seoul>29C',
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-08-28', endDate: '2026-09-02',
    field: 'temperature_max_over', aggregation: 'max', threshold: 29, unit: 'C',
    closeUtc: '2026-08-28 00:00:00 UTC', resolveAfterUtc: '2026-09-03 12:00:00 UTC', deadlineUtc: '2026-09-08 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Tokyo>33C',
    locationName: 'Tokyo', latitude: 35.6762, longitude: 139.6503,
    startDate: '2026-08-30', endDate: '2026-09-04',
    field: 'temperature_max_over', aggregation: 'max', threshold: 33, unit: 'C',
    closeUtc: '2026-08-30 00:00:00 UTC', resolveAfterUtc: '2026-09-05 12:00:00 UTC', deadlineUtc: '2026-09-10 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'HCMC>100mm',
    locationName: 'Ho Chi Minh City', latitude: 10.8231, longitude: 106.6297,
    startDate: '2026-09-01', endDate: '2026-09-08',
    field: 'precipitation_sum_over', aggregation: 'sum', threshold: 100, unit: 'mm',
    closeUtc: '2026-09-01 00:00:00 UTC', resolveAfterUtc: '2026-09-09 12:00:00 UTC', deadlineUtc: '2026-09-14 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Seoul>120mm',
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-09-03', endDate: '2026-09-12',
    field: 'precipitation_sum_over', aggregation: 'sum', threshold: 120, unit: 'mm',
    closeUtc: '2026-09-03 00:00:00 UTC', resolveAfterUtc: '2026-09-13 12:00:00 UTC', deadlineUtc: '2026-09-18 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Singapore>90mm',
    locationName: 'Singapore', latitude: 1.3521, longitude: 103.8198,
    startDate: '2026-09-05', endDate: '2026-09-14',
    field: 'precipitation_sum_over', aggregation: 'sum', threshold: 90, unit: 'mm',
    closeUtc: '2026-09-05 00:00:00 UTC', resolveAfterUtc: '2026-09-15 12:00:00 UTC', deadlineUtc: '2026-09-20 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'NYC>28C',
    locationName: 'New York City', latitude: 40.7128, longitude: -74.0060,
    startDate: '2026-09-07', endDate: '2026-09-13',
    field: 'temperature_max_over', aggregation: 'max', threshold: 28, unit: 'C',
    closeUtc: '2026-09-07 00:00:00 UTC', resolveAfterUtc: '2026-09-14 12:00:00 UTC', deadlineUtc: '2026-09-19 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Tokyo>47mm',
    locationName: 'Tokyo', latitude: 35.6762, longitude: 139.6503,
    startDate: '2026-09-10', endDate: '2026-09-19',
    field: 'precipitation_sum_over', aggregation: 'sum', threshold: 47, unit: 'mm',
    closeUtc: '2026-09-10 00:00:00 UTC', resolveAfterUtc: '2026-09-20 12:00:00 UTC', deadlineUtc: '2026-09-25 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Seoul>28.5C',
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-09-12', endDate: '2026-09-19',
    field: 'temperature_max_over', aggregation: 'max', threshold: 28.5, unit: 'C',
    closeUtc: '2026-09-12 00:00:00 UTC', resolveAfterUtc: '2026-09-20 12:00:00 UTC', deadlineUtc: '2026-09-25 00:00:00 UTC',
  },

  // --- sports: TheSportsDB, every id confirmed via lookupevent.php on
  // 2026-08-17 (status NS, kickoff as below) ---
  { kind: 'sports', label: 'BAY win',       league: 'Bundesliga',     eventId: '2508333', homeTeam: 'Bayern Munich',     awayTeam: 'Stuttgart',      kickoffUtc: '2026-08-28 18:30:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'BVB-HAM o2.5',  league: 'Bundesliga',     eventId: '2508336', homeTeam: 'Borussia Dortmund', awayTeam: 'Hamburg',        kickoffUtc: '2026-08-29 16:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'IPS win',       league: 'Premier League', eventId: '2494027', homeTeam: 'Ipswich Town',      awayTeam: 'Liverpool',      kickoffUtc: '2026-09-04 19:00:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'MCI-COV o2.5',  league: 'Premier League', eventId: '2494024', homeTeam: 'Manchester City',   awayTeam: 'Coventry City',  kickoffUtc: '2026-09-05 14:00:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'LIV win',       league: 'Premier League', eventId: '2494032', homeTeam: 'Liverpool',         awayTeam: 'Fulham',         kickoffUtc: '2026-09-12 14:00:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'TOT-EVE o2.5',  league: 'Premier League', eventId: '2494033', homeTeam: 'Tottenham Hotspur', awayTeam: 'Everton',        kickoffUtc: '2026-09-12 16:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'BRE win',       league: 'Premier League', eventId: '2494047', homeTeam: 'Brentford',         awayTeam: 'Chelsea',        kickoffUtc: '2026-09-18 19:00:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'TOT-AVL o2.5',  league: 'Premier League', eventId: '2494044', homeTeam: 'Tottenham Hotspur', awayTeam: 'Aston Villa',    kickoffUtc: '2026-09-19 11:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },

  // --- ufc: ESPN core, competitor order 1 -> FighterA (verified 2026-08-17).
  // fightStartUtc is the card start for every bout on that card, so betting on
  // a main-card fight closes before the prelims begin. ---
  {
    kind: 'ufc', label: 'Nurmagomedov-Song',
    eventId: '600060620', competitionId: '401887532',
    athleteAId: '4569549', athleteBId: '3151289',
    fighterA: 'Umar Nurmagomedov', fighterB: 'Song Yadong',
    eventName: 'Fight Night: Nurmagomedov vs. Song',
    fightStartUtc: '2026-08-29 07:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Yan-Gomes',
    eventId: '600060620', competitionId: '401887535',
    athleteAId: '4275487', athleteBId: '4963343',
    fighterA: 'Yan Xiaonan', fighterB: 'Denise Gomes',
    eventName: 'Fight Night: Nurmagomedov vs. Song',
    fightStartUtc: '2026-08-29 07:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Rodriguez-Silva',
    eventId: '600060772', competitionId: '401897730',
    athleteAId: '3155420', athleteBId: '5145766',
    fighterA: 'Yair Rodriguez', fighterB: 'Jean Silva',
    eventName: 'Noche UFC: Rodriguez vs. Silva',
    fightStartUtc: '2026-09-12 18:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Fiorot-Grasso',
    eventId: '600060772', competitionId: '401897734',
    athleteAId: '4608674', athleteBId: '3136287',
    fighterA: 'Manon Fiorot', fighterB: 'Alexa Grasso',
    eventName: 'Noche UFC: Rodriguez vs. Silva',
    fightStartUtc: '2026-09-12 18:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'UFC331 main',
    eventId: '600060963', competitionId: '401903509',
    athleteAId: '5120301', athleteBId: '2560746',
    fighterA: 'Joshua Van', fighterB: 'Alexandre Pantoja',
    eventName: '331: Van vs. Pantoja 2',
    fightStartUtc: '2026-09-19 21:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Tsarukyan-Ruffy',
    eventId: '600060963', competitionId: '401905375',
    athleteAId: '4419372', athleteBId: '5122238',
    fighterA: 'Arman Tsarukyan', fighterB: 'Mauricio Ruffy',
    eventName: '331: Van vs. Pantoja 2',
    fightStartUtc: '2026-09-19 21:00:00 UTC',
  },

  // --- space: Launch Library 2, status Go on 2026-08-17. Each launch gets a
  // mission_success market (heavily YES-favoured) and an on_schedule_24h market
  // (genuinely uncertain -- slips are the norm, not the exception). ---
  {
    kind: 'space', label: 'Roman success',
    launchId: '521f3a1c-f977-4306-9b7f-495858719adf',
    vehicle: 'Falcon Heavy (Nancy Grace Roman Space Telescope)',
    field: 'mission_success',
    netUtc: '2026-08-30 11:26:00 UTC',
    closeUtc: '2026-08-30 11:00:00 UTC', resolveAfterUtc: '2026-08-30 17:26:00 UTC', deadlineUtc: '2026-09-29 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Roman on-time',
    launchId: '521f3a1c-f977-4306-9b7f-495858719adf',
    vehicle: 'Falcon Heavy (Nancy Grace Roman Space Telescope)',
    field: 'on_schedule_24h',
    netUtc: '2026-08-30 11:26:00 UTC',
    closeUtc: '2026-08-30 11:00:00 UTC', resolveAfterUtc: '2026-08-31 12:26:00 UTC', deadlineUtc: '2026-09-29 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Crew-13 success',
    launchId: '18441371-8b2e-457c-afb5-1ec1b11ab630',
    vehicle: 'Falcon 9 (Crew-13)',
    field: 'mission_success',
    netUtc: '2026-09-12 22:34:00 UTC',
    closeUtc: '2026-09-12 22:00:00 UTC', resolveAfterUtc: '2026-09-13 04:34:00 UTC', deadlineUtc: '2026-10-12 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Crew-13 on-time',
    launchId: '18441371-8b2e-457c-afb5-1ec1b11ab630',
    vehicle: 'Falcon 9 (Crew-13)',
    field: 'on_schedule_24h',
    netUtc: '2026-09-12 22:34:00 UTC',
    closeUtc: '2026-09-12 22:00:00 UTC', resolveAfterUtc: '2026-09-13 23:34:00 UTC', deadlineUtc: '2026-10-12 00:00:00 UTC',
  },
];

function parseUtc(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/.exec(s);
  if (!m) throw new Error(`bad UTC: ${s}`);
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  if (!Number.isFinite(ms)) throw new Error(`unparseable UTC: ${s}`);
  return ms;
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

/**
 * Load the ed25519 signer for `targetAddr` from the canonical Sui keystore,
 * in-memory only (no secret ever written to disk). Keystore entries are
 * base64(flag || 32-byte secret); flag 0x00 == ed25519.
 */
function loadKeypairFromKeystore(targetAddr: string): Ed25519Keypair {
  const path = process.env.SUI_KEYSTORE_PATH
    || join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as string[];
  const want = targetAddr.toLowerCase();
  for (const b64 of entries) {
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length !== 33 || bytes[0] !== 0x00) continue; // ed25519 only
    const kp = Ed25519Keypair.fromSecretKey(bytes.subarray(1, 33));
    if (kp.toSuiAddress().toLowerCase() === want) return kp;
  }
  throw new Error(`admin key for ${targetAddr} not found in keystore ${path}`);
}

function requireHex64(n: string, v: string): string {
  if (!HEX_64.test(v)) { console.error(`${n} must be 0x-32-byte hex`); process.exit(1); }
  return v.toLowerCase();
}

interface Market {
  label: string;
  category: 'sports' | 'weather' | 'space';
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildSports(spec: SportsSpec): Market {
  const kickoffMs = parseUtc(spec.kickoffUtc);
  const resolveAfterMs = kickoffMs + 3 * 60 * 60_000;
  const closeMs = kickoffMs - 5 * 60_000;
  const deadlineMs = kickoffMs + 7 * 24 * 60 * 60_000;
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('sports deadline too early');
  const source = `${SPORTSDB_BASE}/lookupevent.php?id=${spec.eventId}`;
  const isTotal = spec.field === 'total_score_over';
  if (isTotal && typeof spec.totalThreshold !== 'number') {
    throw new Error(`${spec.label}: total_score_over needs totalThreshold`);
  }
  const criteria =
    `Kind: sports\n` +
    `Provider: thesportsdb\n` +
    `EventId: ${spec.eventId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: ${spec.field}\n` +
    (isTotal ? `Threshold: ${spec.totalThreshold}\n` : '') +
    `TieBreak: NO\n`;
  const question = isTotal
    ? `${spec.league} - Will ${spec.homeTeam} vs ${spec.awayTeam} have more than ${spec.totalThreshold} total goals?`
    : `${spec.league} - Will ${spec.homeTeam} beat ${spec.awayTeam}?`;
  const description = isTotal
    ? `Binary outcome on the full-time (incl. extra time) recorded score of the ${spec.league} fixture ` +
      `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
      `Resolves YES iff the combined goals of both teams is strictly greater than ${spec.totalThreshold}; NO otherwise. ` +
      `Penalty-shootout goals are not counted. If the match is postponed past the resolve deadline the market is auto-cancelled.`
    : `Binary outcome on the full-time (incl. extra time) recorded score of the ${spec.league} fixture ` +
      `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
      `Resolves YES iff ${spec.homeTeam} wins; NO on a draw or an ${spec.awayTeam} win. ` +
      `Penalty-shootout goals are not counted. If the match is postponed past the resolve deadline the market is auto-cancelled.`;
  return {
    label: spec.label, category: 'sports',
    question, description,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildUfc(spec: UfcSpec): Market {
  const startMs = parseUtc(spec.fightStartUtc);
  // ESPN status lag after a bout is usually minutes, occasionally hours. The
  // anchor is the card start, so a main-card bout resolves later than this.
  const resolveAfterMs = startMs + 4 * 60 * 60_000;
  const closeMs = startMs - 5 * 60_000;
  const deadlineMs = startMs + 7 * 24 * 60 * 60_000;
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('ufc deadline too early');
  const criteria =
    `Kind: ufc\n` +
    `Provider: espn\n` +
    `EventId: ${spec.eventId}\n` +
    `CompetitionId: ${spec.competitionId}\n` +
    `FighterA: ${spec.fighterA}\n` +
    `FighterB: ${spec.fighterB}\n` +
    `AthleteAId: ${spec.athleteAId}\n` +
    `AthleteBId: ${spec.athleteBId}\n` +
    `Field: fighter_a_wins\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n`;
  return {
    label: spec.label, category: 'sports',
    question: `UFC ${spec.eventName}: Will ${spec.fighterA} beat ${spec.fighterB}?`,
    description:
      `Binary outcome on the official ESPN result of the UFC ${spec.eventName} bout ` +
      `${spec.fighterA} vs ${spec.fighterB} (card start ${spec.fightStartUtc}). ` +
      `Resolves YES iff ${spec.fighterA} is declared the winner; NO iff ${spec.fighterB} is ` +
      `declared the winner. A No Contest, Draw, or bout not completed by the resolve deadline ` +
      `results in the market being auto-cancelled (refund).`,
    resolutionSource: `${ESPN_BASE}/events/${spec.eventId}/competitions/${spec.competitionId}`,
    resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildWeather(spec: WeatherSpec): Market {
  const closeMs = parseUtc(spec.closeUtc);
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const deadlineMs = parseUtc(spec.deadlineUtc);
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('weather deadline too early');
  const source = `https://archive-api.open-meteo.com/v1/archive?latitude=${spec.latitude}&longitude=${spec.longitude}` +
    `&start_date=${spec.startDate}&end_date=${spec.endDate}` +
    `&daily=temperature_2m_max,precipitation_sum&timezone=UTC`;
  const fieldDesc: Record<WeatherSpec['field'], string> = {
    temperature_max_over: 'the daily maximum temperature',
    precipitation_sum_over: 'the daily precipitation sum',
    rainy_days_over: 'the number of rainy days (precip > 1mm)',
  };
  const criteria =
    `Kind: weather\n` +
    `Provider: open-meteo\n` +
    `Latitude: ${spec.latitude}\n` +
    `Longitude: ${spec.longitude}\n` +
    `LocationName: ${spec.locationName}\n` +
    `StartDate: ${spec.startDate}\n` +
    `EndDate: ${spec.endDate}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: ${spec.field}\n` +
    `Aggregation: ${spec.aggregation}\n` +
    `Threshold: ${spec.threshold}\n` +
    `TieBreak: NO\n`;
  // Every field gets its own phrasing. The generic fallback used to read
  // "record sum the daily precipitation sum above 100mm" -- aggregation and
  // fieldDesc both carry the word, and `question` is onchain-immutable, so a
  // clumsy sentence ships permanently. It did, on four of the eight weather
  // markets in this batch.
  const verb = spec.field === 'rainy_days_over'
    ? `more than ${spec.threshold} rainy days`
    : spec.field === 'temperature_max_over'
      ? `a daily high above ${spec.threshold}${spec.unit} on any day`
      : spec.field === 'precipitation_sum_over'
        ? `more than ${spec.threshold}${spec.unit} of total precipitation`
        : `${spec.aggregation} ${fieldDesc[spec.field]} above ${spec.threshold}${spec.unit}`;
  return {
    label: spec.label, category: 'weather',
    question: `Will ${spec.locationName} record ${verb} during ${spec.startDate} through ${spec.endDate}?`,
    description:
      `Binary outcome on Open-Meteo's historical-weather archive for ${spec.locationName} ` +
      `(lat ${spec.latitude}, lon ${spec.longitude}). Resolves YES iff the ${spec.aggregation} of ${fieldDesc[spec.field]} ` +
      `across ${spec.startDate} to ${spec.endDate} (inclusive, UTC) exceeds ${spec.threshold}${spec.unit}. ` +
      `Data is fetched once after ${fmtUtc(resolveAfterMs)} from archive-api.open-meteo.com.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildSpace(spec: SpaceSpec): Market {
  const closeMs = parseUtc(spec.closeUtc);
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const deadlineMs = parseUtc(spec.deadlineUtc);
  const netMs = parseUtc(spec.netUtc);
  if (resolveAfterMs <= netMs) throw new Error(`${spec.label}: resolveAfter must be after net`);
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error(`${spec.label}: space deadline too early`);
  const source = `${LL2_BASE}/launch/${spec.launchId}/`;
  const onSchedule = spec.field === 'on_schedule_24h';
  if (onSchedule && resolveAfterMs < netMs + (ON_SCHEDULE_TOLERANCE_SEC + 3600) * 1000) {
    // Reading before net + tolerance + 1h would judge a slip that has not yet
    // exhausted its window, so the resolver could only answer "pending".
    throw new Error(`${spec.label}: on_schedule_24h resolveAfter must be >= net + 25h`);
  }
  const criteria = onSchedule
    ? `Kind: space\n` +
      `Provider: ll2\n` +
      `LaunchId: ${spec.launchId}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
      `Field: on_schedule_24h\n` +
      `ScheduledNet: ${fmtUtc(netMs)}\n` +
      `ToleranceSec: ${ON_SCHEDULE_TOLERANCE_SEC}\n` +
      `TieBreak: NO\n`
    : `Kind: space\n` +
      `Provider: ll2\n` +
      `LaunchId: ${spec.launchId}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
      `Field: mission_success\n` +
      `SuccessStatusIds: 3\n` +
      `TieBreak: NO\n`;
  const question = onSchedule
    ? `Will the ${spec.vehicle} launch lift off within 24h of its scheduled ${spec.netUtc}?`
    : `Will the ${spec.vehicle} launch (scheduled ${spec.netUtc}) be a success?`;
  const description = onSchedule
    ? `Binary outcome on the actual liftoff time of ${spec.vehicle} (Launch Library 2 id ${spec.launchId}) ` +
      `versus the T-0 recorded at market creation (${spec.netUtc}). Resolves YES iff the launch reaches a ` +
      `terminal status (Success, Failure, or Partial Failure) and the observed liftoff falls within ` +
      `24 hours of the scheduled T-0; NO if repeated scrubs push it beyond that window. If the launch has ` +
      `not lifted off by the resolve deadline the market is auto-cancelled and stakes refunded.`
    : `Binary outcome on the launch result of ${spec.vehicle} (Launch Library 2 id ${spec.launchId}, ` +
      `scheduled T-0 ${spec.netUtc}). Resolves YES iff the launch status is Success; NO if it is a ` +
      `Failure or Partial Failure. If the launch has not reached a terminal status by the resolve ` +
      `deadline the market is auto-cancelled and stakes refunded.`;
  return {
    label: spec.label, category: 'space',
    question, description,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildMarket(spec: Spec): Market {
  switch (spec.kind) {
    case 'sports': return buildSports(spec);
    case 'ufc': return buildUfc(spec);
    case 'weather': return buildWeather(spec);
    case 'space': return buildSpace(spec);
  }
}

/** Parse each built criteria with the real keeper parser; format errors throw. */
function selfValidate(spec: Spec, m: Market): void {
  if (spec.kind === 'sports') {
    const c = parseSportsCriteria(m.resolutionCriteria);
    if (c.field !== spec.field) throw new Error(`${m.label}: sports field ${c.field} != ${spec.field}`);
    if (c.eventId !== spec.eventId) throw new Error(`${m.label}: eventId mismatch`);
    if (spec.field === 'total_score_over' && c.threshold !== spec.totalThreshold) {
      throw new Error(`${m.label}: sports threshold mismatch`);
    }
  } else if (spec.kind === 'ufc') {
    const c = parseUfcCriteria(m.resolutionCriteria);
    if (c.competitionId !== spec.competitionId) throw new Error(`${m.label}: competitionId mismatch`);
    if (c.athleteAId !== spec.athleteAId || c.athleteBId !== spec.athleteBId) {
      throw new Error(`${m.label}: athlete id mismatch`);
    }
  } else if (spec.kind === 'space') {
    const c = parseSpaceCriteria(m.resolutionCriteria);
    if (c.field !== spec.field) throw new Error(`${m.label}: space field ${c.field} != ${spec.field}`);
    if (c.launchId !== spec.launchId.toLowerCase()) throw new Error(`${m.label}: launchId mismatch`);
    if (spec.field === 'on_schedule_24h') {
      if (c.scheduledNetMs !== parseUtc(spec.netUtc)) throw new Error(`${m.label}: ScheduledNet mismatch`);
      if (c.toleranceSec !== ON_SCHEDULE_TOLERANCE_SEC) throw new Error(`${m.label}: ToleranceSec mismatch`);
    }
  } else {
    parseWeatherCriteria(m.resolutionCriteria);
  }
  const now = Date.now();
  if (m.closeTimeMs <= now) throw new Error(`${m.label}: closeTime is not in the future`);
  if (m.resolveDeadlineMs <= m.closeTimeMs) throw new Error(`${m.label}: deadline <= close`);
}

// ============================================================
// Optional live upstream verification (--verify)
// ============================================================

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { 'user-agent': 'nasun-pado-batch/1', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function fail(label: string, msg: string, problems: string[]): void {
  problems.push(`${label}: ${msg}`);
}

/**
 * Re-read every event-driven upstream and confirm the pinned identifiers still
 * describe the same event. Catches a rescheduled fixture, a reshuffled bout, or
 * a launch slipping out of the betting window between research and creation.
 */
async function verifyUpstream(specs: Spec[]): Promise<string[]> {
  const problems: string[] = [];

  for (const s of specs.filter((x): x is SportsSpec => x.kind === 'sports')) {
    try {
      const d = await getJson(`${SPORTSDB_BASE}/lookupevent.php?id=${s.eventId}`) as
        { events?: { strHomeTeam?: string; strAwayTeam?: string; strTimestamp?: string; strStatus?: string }[] | null };
      const e = d.events?.[0];
      if (!e) { fail(s.label, `TheSportsDB has no event ${s.eventId}`, problems); continue; }
      const iso = (e.strTimestamp ?? '').replace(' ', 'T');
      const apiMs = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
      const specMs = parseUtc(s.kickoffUtc);
      if (Number.isFinite(apiMs) && Math.abs(apiMs - specMs) > 60_000) {
        fail(s.label, `kickoff drift: spec ${s.kickoffUtc} vs API ${e.strTimestamp}`, problems);
      }
      if (e.strHomeTeam !== s.homeTeam || e.strAwayTeam !== s.awayTeam) {
        fail(s.label, `team drift: API ${e.strHomeTeam} vs ${e.strAwayTeam}`, problems);
      }
      if (e.strStatus && !['NS', 'Not Started', ''].includes(e.strStatus)) {
        fail(s.label, `status is ${e.strStatus}, expected NS`, problems);
      }
    } catch (err) {
      fail(s.label, `sports lookup failed: ${String(err)}`, problems);
    }
  }

  for (const s of specs.filter((x): x is UfcSpec => x.kind === 'ufc')) {
    try {
      const c = await getJson(`${ESPN_BASE}/events/${s.eventId}/competitions/${s.competitionId}`) as
        { competitors?: { order?: number; athlete?: { $ref?: string } }[] };
      const competitors = [...(c.competitors ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (competitors.length !== 2) { fail(s.label, `expected 2 competitors, got ${competitors.length}`, problems); continue; }
      const ids: string[] = [];
      const names: string[] = [];
      for (const comp of competitors) {
        const ref = comp.athlete?.$ref;
        if (!ref) { fail(s.label, 'competitor without athlete ref', problems); break; }
        const a = await getJson(ref.replace(/^http:/, 'https:')) as { id?: string; displayName?: string };
        ids.push(String(a.id ?? ''));
        names.push(a.displayName ?? '');
      }
      if (ids.length === 2) {
        if (ids[0] !== s.athleteAId || ids[1] !== s.athleteBId) {
          fail(s.label, `athlete order drift: ESPN ${ids.join(' vs ')}`, problems);
        }
        if (names[0]?.toLowerCase() !== s.fighterA.toLowerCase()
          || names[1]?.toLowerCase() !== s.fighterB.toLowerCase()) {
          fail(s.label, `fighter name drift: ESPN ${names.join(' vs ')}`, problems);
        }
      }
    } catch (err) {
      fail(s.label, `ESPN lookup failed: ${String(err)}`, problems);
    }
  }

  // Two markets share each launch, so cache per launch id: LL2's free tier
  // allows only 15 requests per hour.
  const ll2Cache = new Map<string, { net?: string; status?: { abbrev?: string } }>();
  for (const s of specs.filter((x): x is SpaceSpec => x.kind === 'space')) {
    try {
      let l = ll2Cache.get(s.launchId);
      if (!l) {
        l = await getJson(`${LL2_BASE}/launch/${s.launchId}/?mode=list`) as
          { net?: string; status?: { abbrev?: string } };
        ll2Cache.set(s.launchId, l);
      }
      const apiMs = Date.parse(l.net ?? '');
      if (!Number.isFinite(apiMs)) { fail(s.label, 'LL2 returned no net', problems); continue; }
      if (Math.abs(apiMs - parseUtc(s.netUtc)) > 60_000) {
        fail(s.label, `net drift: spec ${s.netUtc} vs API ${l.net}`, problems);
      }
      if (apiMs <= parseUtc(s.closeUtc)) {
        fail(s.label, `net ${l.net} is at/before close ${s.closeUtc}`, problems);
      }
      if (l.status?.abbrev !== 'Go') fail(s.label, `status is ${l.status?.abbrev}, expected Go`, problems);
    } catch (err) {
      fail(s.label, `LL2 lookup failed: ${String(err)}`, problems);
    }
  }

  return problems;
}

function buildCreateTx(packageId: string, cap: string, resolver: string, m: Market): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::create_market`,
    arguments: [
      tx.object(cap),
      tx.pure.string(m.question),
      tx.pure.string(m.description),
      tx.pure.string(m.category),
      tx.pure.string(m.resolutionSource),
      tx.pure.string(m.resolutionCriteria),
      tx.pure.u64(BigInt(m.closeTimeMs)),
      tx.pure.u64(BigInt(m.resolveDeadlineMs)),
      tx.pure.address(resolver),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Create one market, retrying without ever minting a second one.
 *
 * The trap this avoids: signAndExecuteTransaction can fail *after* the node has
 * accepted the transaction -- the response is what got lost (`fetch failed`,
 * `socket hang up`, `ECONNRESET`, a 5xx from a proxy). The previous shape built
 * a fresh Transaction on every attempt, so the retry picked new gas, produced a
 * different digest, and executed a *second* create_market. `question` is
 * onchain-immutable, so the duplicate is permanent.
 *
 * Fix: build and sign exactly once, then resubmit the identical bytes. Sui
 * dedupes by digest, so a resubmit of an already-executed transaction returns
 * its original effects instead of running again -- idempotent by construction,
 * with no dependency on indexer lag to detect the first attempt.
 *
 * The two error classes are handled differently on purpose. Admission-time
 * conflicts (stale gas version, locked object, equivocation) prove the
 * transaction did NOT execute, so those rebuild with fresh gas. Everything else
 * retriable is a lost response, and must reuse the same bytes.
 */
async function createOnChain(
  client: SuiClient, admin: Ed25519Keypair, packageId: string, cap: string,
  resolver: string, m: Market,
): Promise<string> {
  let lastErr: unknown;
  let signed: { bytes: Uint8Array; signature: string } | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (!signed) {
        const tx = buildCreateTx(packageId, cap, resolver, m);
        // signAndExecuteTransaction used to do this via setSenderIfNotSet.
        // Building by hand does not, and build() throws "Missing transaction
        // sender" without it.
        tx.setSender(admin.toSuiAddress());
        const bytes = await tx.build({ client });
        const { signature } = await admin.signTransaction(bytes);
        signed = { bytes, signature };
      }
      const r = await client.executeTransactionBlock({
        transactionBlock: signed.bytes, signature: signed.signature,
        options: { showEffects: true, showObjectChanges: true },
      });
      if (r.effects?.status?.status !== 'success') {
        throw new Error(`TX failed: ${r.effects?.status?.error ?? '?'}`);
      }
      await client.waitForTransaction({ digest: r.digest });
      const obj = r.objectChanges?.find(
        (c): c is Extract<SuiObjectChange, { type: 'created' }> =>
          c.type === 'created' && c.objectType.endsWith('::prediction_market::Market'),
      );
      if (!obj) throw new Error('Market not in objectChanges');
      return obj.objectId;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Conflict = rejected at admission, so nothing executed: rebuild with fresh gas.
      const conflict = /not available for consumption|current version|ObjectVersionUnavailable|already locked|reference is not available|EquivocationDetected/i.test(msg);
      // Lost response: the tx may well have executed. Resubmit the SAME bytes.
      // The SDK's http transport throws `Unexpected status code: 502`, not
      // anything containing "HTTP", so match that shape too or this whole
      // idempotent path never fires on the failure it exists for.
      const lostResponse =
        /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|network|timeout/i.test(msg)
        || /(?:HTTP|status code:?)\s*(?:429|5\d\d)/i.test(msg);
      if (conflict) signed = null;
      if (!(conflict || lostResponse) || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const verify = process.argv.includes('--verify');
  // --only a,b,c : re-run just these labels. Retries inside a single market are
  // idempotent (see createOnChain), but a re-run of the whole batch after a
  // partial failure would recreate everything that already succeeded, and
  // `question` is immutable with no delete path. The failure list printed at the
  // end is in exactly this format, so a partial run is resumed by pasting it.
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const allMarkets = SPECS.map((s) => {
    const m = buildMarket(s);
    selfValidate(s, m);
    return m;
  });
  if (only) {
    const known = new Set(allMarkets.map((m) => m.label));
    const unknown = [...only].filter((l) => !known.has(l));
    if (unknown.length > 0) {
      console.error(`--only names labels that do not exist: ${unknown.join(', ')}`);
      process.exit(1);
    }
  }
  const markets = only ? allMarkets.filter((m) => only.has(m.label)) : allMarkets;
  const byCat = markets.reduce<Record<string, number>>((acc, m) => {
    acc[m.category] = (acc[m.category] ?? 0) + 1; return acc;
  }, {});
  for (const m of markets) {
    console.log(`--- [${m.category}] ${m.label} ---`);
    console.log(`  Q: ${m.question}`);
    console.log(`  close:    ${fmtUtc(m.closeTimeMs)}`);
    console.log(`  deadline: ${fmtUtc(m.resolveDeadlineMs)}`);
    console.log(`  criteria:`);
    for (const ln of m.resolutionCriteria.split('\n').filter(Boolean)) console.log(`    ${ln}`);
    console.log('');
  }
  console.log(`Total: ${markets.length} markets (self-validated against keeper parsers).`);
  console.log(`By category: ${JSON.stringify(byCat)}`);

  if (verify) {
    console.log('\nVerifying identifiers against live upstreams...');
    const problems = await verifyUpstream(SPECS);
    if (problems.length > 0) {
      console.error(`\nUpstream verification found ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log('Upstream verification passed for every event-driven market.');
  }

  if (dry) { console.log('[DRY RUN]'); return; }

  const resolver = requireHex64(
    'CANON_RESOLVER',
    process.env.PREDICTION_RESOLVER_ADDRESS_OVERRIDE || CANON_RESOLVER,
  );
  const packageId = requireHex64('CANON_PACKAGE_ID', CANON_PACKAGE_ID);
  const cap = requireHex64('CANON_ADMIN_CAP', CANON_ADMIN_CAP);
  const client = new SuiClient({ url: RPC_URL });

  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (!capOwner) { console.error(`AdminCap ${cap} has no AddressOwner`); process.exit(1); }
  const admin = process.env.PREDICTION_ADMIN_KEY_OVERRIDE
    ? parseKeypair(process.env.PREDICTION_ADMIN_KEY_OVERRIDE)
    : loadKeypairFromKeystore(capOwner);
  const adminAddr = admin.toSuiAddress().toLowerCase();
  if (adminAddr !== capOwner.toLowerCase()) {
    console.error(`signer ${adminAddr} != AdminCap owner ${capOwner}`); process.exit(1);
  }
  if (adminAddr === resolver) { console.error('admin == resolver'); process.exit(1); }

  console.log(`Creating ${markets.length} markets (creator=${adminAddr}, resolver=${resolver})`);
  const created: { label: string; id: string }[] = [];
  const failed: { label: string; reason: string }[] = [];
  for (const m of markets) {
    process.stdout.write(`  [${m.category}/${m.label}] creating... `);
    try {
      const id = await createOnChain(client, admin, packageId, cap, resolver, m);
      console.log(id);
      created.push({ label: m.label, id });
      await new Promise((r) => setTimeout(r, 4000));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${reason}`);
      failed.push({ label: m.label, reason });
    }
  }
  console.log(`\nCreated ${created.length}/${markets.length}:`);
  for (const c of created) console.log(`  ${c.label}: ${c.id}`);

  // Exit non-zero when anything failed. The per-market catch above keeps the
  // batch going so one bad market cannot strand the other 25, but swallowing
  // the outcome as well meant `Created 0/26` still exited 0 -- nothing wrapping
  // this script could tell a total failure from a clean run.
  if (failed.length > 0) {
    console.error(`\nFailed ${failed.length}/${markets.length}:`);
    for (const f of failed) console.error(`  ${f.label}: ${f.reason}`);
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
