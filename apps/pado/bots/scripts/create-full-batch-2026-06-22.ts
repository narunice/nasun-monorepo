/**
 * Post-reset prediction-market batch (2026-06-22, devnet v8 "V10-v8reset").
 *
 * Devnet was reset; the prediction package + AdminCap were re-published, so the
 * old market set is gone. This seeds a fresh, real-event batch across six
 * auto-resolvable categories, sports-weighted on the ongoing FIFA World Cup
 * 2026 (group-stage matchday 3, the remaining fixtures):
 *   crypto   (Binance spot)            -> 3 (BTC / ETH / SOL)
 *   finance  (Twelve Data daily close) -> 3 (NVDA / AAPL / TSLA)
 *   space    (Launch Library 2)        -> 2 (Falcon 9 Starlink / Pegasus XL)
 *   weather  (Open-Meteo archive)      -> 2 (Seoul monsoon rain / heat)
 *   music    (Apple Music RSS)         -> 2 (US #1 / KR #1 hold)
 *   sports   (TheSportsDB)             -> 5 (FIFA World Cup 2026 matchday 3)
 *
 * Canonical ids are pinned from packages/devnet-config/devnet-ids.json
 * ("V10-v8reset", 2026-06-19) and verified live on-chain this session:
 *   package   0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9 (Immutable)
 *   AdminCap  0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac
 *             owned by admin 0x98f5339a... (keystore alias admin-v8)
 * The committed bots/.env is stale (old dead package + an admin key that owns
 * no AdminCap), so package/cap are hardcoded here and the signer is loaded
 * in-memory from the local Sui keystore: the script reads the AdminCap owner
 * on-chain and pulls that exact ed25519 key from ~/.sui/sui_config/sui.keystore
 * (alias admin-v8) without ever writing a secret to disk. Override with
 * PREDICTION_ADMIN_KEY_OVERRIDE only if the key is not in the keystore.
 * Resolver is the LIVE keeper wallet 0x5cbc8390... (CANON_RESOLVER, verified
 * this session resolving markets on this package), distinct from the creator
 * per Move's ECreatorIsResolver. NOTE: the stale bots/.env resolver 0xd413721d
 * is NOT the active keeper; markets created with it are orphaned.
 *
 * Live data verified 2026-06-21 ~15:42 UTC (machine clock; KST 2026-06-22):
 *   Binance spot: BTC=64254 ETH=1730.69 SOL=74.12
 *   Twelve Data daily close (2026-06-18, last session; 06-19 Juneteenth holiday):
 *                 NVDA=210.69 AAPL=298.01 TSLA=400.49
 *   LL2 upcoming (status Go):
 *     Falcon 9 Starlink Group 17-45 a4fb0d1a-2655-4552-b950-f2f6340ef85a net 2026-06-25 02:48Z
 *     Pegasus XL  Swift Boost       f596ad48-881e-47d6-806d-113c6dd97427 net 2026-06-27 09:00Z
 *   Apple Music most-played #1: US trackId 6769568596 "Janice STFU" (Drake);
 *                               KR trackId 1887671067 "REDRED" (CORTIS).
 *   TheSportsDB FIFA World Cup (league 4429) matchday 3, all status NS:
 *     2391767 Switzerland vs Canada            2026-06-24 19:00Z
 *     2461115 Bosnia-Herzegovina vs Qatar      2026-06-24 19:00Z
 *     2391764 Morocco vs Haiti                 2026-06-24 22:00Z
 *     2391765 Scotland vs Brazil               2026-06-24 22:00Z
 *     2391766 South Africa vs South Korea      2026-06-25 01:00Z
 *
 * Crypto/stock thresholds are pinned just off spot for genuine toss-ups.
 * Every criteria block is self-validated against the live keeper parser in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 *
 * Required env: none. Admin signer is loaded in-memory from the Sui keystore
 * (AdminCap owner); resolver + package + cap are pinned constants. Optional
 * overrides: PREDICTION_ADMIN_KEY_OVERRIDE (if admin-v8 not in keystore),
 * PREDICTION_RESOLVER_ADDRESS_OVERRIDE (if the keeper identity rotates).
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-06-22.ts --dry-run
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-06-22.ts            # live
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseWeatherCriteria } from '../lib/resolvers/weather.js';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';
import { parseMusicCriteria } from '../lib/resolvers/music.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
// Canonical v8-reset ids (devnet-ids.json "V10-v8reset" 2026-06-19), on-chain
// verified this session. Hardcoded because the committed bots/.env is stale.
const CANON_PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const CANON_ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
// Live keeper resolver: verified this session by observing it resolve 4 crypto
// markets correctly ~2min after close (2026-06-21 16:22 UTC). The stale
// bots/.env resolver (0xd413721d) is NOT the active keeper, so markets created
// with it are orphaned (never auto-resolved). Override via
// PREDICTION_RESOLVER_ADDRESS_OVERRIDE if the keeper identity rotates.
const CANON_RESOLVER = '0x5cbc8390ae709b0358f304fd76691dda1f03eae514a9592153125c8cff23aeb0';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

type Comparator = '>' | '<';

interface CryptoSpec {
  kind: 'crypto';
  label: string;
  symbol: string;
  display: string;
  threshold: number;
  comparator: Comparator;
  closeUtc: string;
}

interface StockSpec {
  kind: 'stock';
  label: string;
  ticker: string;
  currency: 'USD';
  threshold: number;
  comparator: Comparator;
  closeUtc: string;
}

interface SpaceSpec {
  kind: 'space';
  label: string;
  launchId: string;
  launchName: string;
  scheduledNet: string;
  closeUtc: string;
  resolveAfterUtc: string;
  deadlineUtc: string;
}

interface WeatherSpec {
  kind: 'weather';
  label: string;
  latitude: number;
  longitude: number;
  locationName: string;
  startDate: string;
  endDate: string;
  field: 'rainy_days_over' | 'temperature_max_over' | 'precipitation_sum_over';
  aggregation: 'count' | 'max' | 'mean' | 'sum';
  threshold: number;
  closeUtc: string;
  resolveAfterUtc: string;
  deadlineUtc: string;
}

interface SportsSpec {
  kind: 'sports';
  label: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
}

interface MusicSpec {
  kind: 'music';
  label: string;
  country: string;
  chart: 'most-played';
  trackId: string;
  trackName: string;
  artistName: string;
  comparisonOp: '==' | '<=';
  threshold: number;
  resolveAfterUtc: string;
}

type Spec =
  | CryptoSpec | StockSpec | SpaceSpec | WeatherSpec | SportsSpec | MusicSpec;

// ===== batch definition =====
const SPECS: Spec[] = [
  // --- crypto: close 2026-06-30 23:59 UTC; lines just off spot ---
  { kind: 'crypto', label: 'BTC>65k',  symbol: 'BTCUSDT', display: 'BTC', threshold: 65000, comparator: '>', closeUtc: '2026-06-30 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>1750', symbol: 'ETHUSDT', display: 'ETH', threshold: 1750,  comparator: '>', closeUtc: '2026-06-30 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL>75',   symbol: 'SOLUSDT', display: 'SOL', threshold: 75,    comparator: '>', closeUtc: '2026-06-30 23:59:00 UTC' },
  // --- stock: NYSE close 2026-06-26 (Fri) 20:00 UTC (EDT) ---
  { kind: 'stock', label: 'NVDA>212', ticker: 'NVDA', currency: 'USD', threshold: 212, comparator: '>', closeUtc: '2026-06-26 20:00:00 UTC' },
  { kind: 'stock', label: 'AAPL>300', ticker: 'AAPL', currency: 'USD', threshold: 300, comparator: '>', closeUtc: '2026-06-26 20:00:00 UTC' },
  { kind: 'stock', label: 'TSLA>405', ticker: 'TSLA', currency: 'USD', threshold: 405, comparator: '>', closeUtc: '2026-06-26 20:00:00 UTC' },
  // --- space ---
  {
    kind: 'space', label: 'F9 Starlink 17-45',
    launchId: 'a4fb0d1a-2655-4552-b950-f2f6340ef85a',
    launchName: 'Falcon 9 Starlink Group 17-45',
    scheduledNet: '2026-06-25 02:48:00 UTC',
    closeUtc: '2026-06-25 02:00:00 UTC',
    resolveAfterUtc: '2026-06-25 09:00:00 UTC',
    deadlineUtc: '2026-07-02 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Pegasus Swift Boost',
    launchId: 'f596ad48-881e-47d6-806d-113c6dd97427',
    launchName: 'Pegasus XL Swift Boost Mission',
    scheduledNet: '2026-06-27 09:00:00 UTC',
    closeUtc: '2026-06-27 08:00:00 UTC',
    resolveAfterUtc: '2026-06-27 16:00:00 UTC',
    deadlineUtc: '2026-07-04 00:00:00 UTC',
  },
  // --- weather: Seoul monsoon window (entirely future) ---
  {
    kind: 'weather', label: 'Seoul rain',
    latitude: 37.5665, longitude: 126.9780, locationName: 'Seoul',
    startDate: '2026-06-23', endDate: '2026-06-29',
    field: 'rainy_days_over', aggregation: 'count', threshold: 3,
    closeUtc: '2026-06-23 00:00:00 UTC',
    resolveAfterUtc: '2026-06-30 12:00:00 UTC',
    deadlineUtc: '2026-07-07 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Seoul heat',
    latitude: 37.5665, longitude: 126.9780, locationName: 'Seoul',
    startDate: '2026-06-23', endDate: '2026-06-29',
    field: 'temperature_max_over', aggregation: 'max', threshold: 33,
    closeUtc: '2026-06-23 00:00:00 UTC',
    resolveAfterUtc: '2026-06-30 12:00:00 UTC',
    deadlineUtc: '2026-07-07 00:00:00 UTC',
  },
  // --- sports: FIFA World Cup 2026 matchday 3 (remaining group fixtures) ---
  { kind: 'sports', label: 'SUI-CAN', league: 'FIFA World Cup', eventId: '2391767', homeTeam: 'Switzerland',        awayTeam: 'Canada',      kickoffUtc: '2026-06-24 19:00:00 UTC' },
  { kind: 'sports', label: 'BIH-QAT', league: 'FIFA World Cup', eventId: '2461115', homeTeam: 'Bosnia-Herzegovina', awayTeam: 'Qatar',       kickoffUtc: '2026-06-24 19:00:00 UTC' },
  { kind: 'sports', label: 'MAR-HAI', league: 'FIFA World Cup', eventId: '2391764', homeTeam: 'Morocco',            awayTeam: 'Haiti',       kickoffUtc: '2026-06-24 22:00:00 UTC' },
  { kind: 'sports', label: 'SCO-BRA', league: 'FIFA World Cup', eventId: '2391765', homeTeam: 'Scotland',           awayTeam: 'Brazil',      kickoffUtc: '2026-06-24 22:00:00 UTC' },
  { kind: 'sports', label: 'RSA-KOR', league: 'FIFA World Cup', eventId: '2391766', homeTeam: 'South Africa',       awayTeam: 'South Korea', kickoffUtc: '2026-06-25 01:00:00 UTC' },
  // --- music: hold #1 on most-played ---
  {
    kind: 'music', label: 'US #1 Drake',
    country: 'us', chart: 'most-played',
    trackId: '6769568596', trackName: 'Janice STFU', artistName: 'Drake',
    comparisonOp: '==', threshold: 1,
    resolveAfterUtc: '2026-06-29 18:00:00 UTC',
  },
  {
    kind: 'music', label: 'KR #1 CORTIS',
    country: 'kr', chart: 'most-played',
    trackId: '1887671067', trackName: 'REDRED', artistName: 'CORTIS',
    comparisonOp: '==', threshold: 1,
    resolveAfterUtc: '2026-06-29 18:00:00 UTC',
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
  category: 'crypto' | 'finance' | 'space' | 'weather' | 'sports' | 'music';
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildMarket(spec: Spec): Market {
  if (spec.kind === 'crypto') {
    const closeMs = parseUtc(spec.closeUtc);
    const deadlineMs = closeMs + 2 * 24 * 60 * 60_000;
    const source = `https://api.binance.com/api/v3/ticker/price?symbol=${spec.symbol}`;
    const criteria =
      `Source: ${source}\n` +
      `Reading time: ${spec.closeUtc}\n` +
      `Comparison: price ${spec.comparator} ${spec.threshold}\n` +
      `Tie-breaking: NO\n`;
    return {
      label: spec.label, category: 'crypto',
      question: `\u{1F4B0} Will ${spec.display} be ${spec.comparator === '>' ? 'above' : 'below'} $${spec.threshold.toLocaleString('en-US')} on ${spec.closeUtc.slice(0, 10)}?`,
      description:
        `Binary outcome on the Binance ${spec.symbol} spot price read at ${spec.closeUtc}. ` +
        `Resolves YES iff price ${spec.comparator} ${spec.threshold} USD. Tie resolves NO.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  if (spec.kind === 'stock') {
    const closeMs = parseUtc(spec.closeUtc);
    const deadlineMs = closeMs + 7 * 24 * 60 * 60_000;
    const session = spec.closeUtc.slice(0, 10);
    const source = `https://api.twelvedata.com/time_series?symbol=${spec.ticker}&interval=1day`;
    const criteria =
      `Source: ${source}\n` +
      `Symbol: ${spec.ticker}\n` +
      `Currency: ${spec.currency}\n` +
      `Reading time: ${spec.closeUtc}\n` +
      `Comparison: close ${spec.comparator} ${spec.threshold}\n` +
      `Tie-breaking: NO\n`;
    return {
      label: spec.label, category: 'finance',
      question: `\u{1F4C8} Will ${spec.ticker} close ${spec.comparator === '>' ? 'above' : 'below'} $${spec.threshold} on its ${session} session?`,
      description:
        `Binary outcome on the ${spec.ticker} regular-session daily close for the trading day at ${spec.closeUtc}. ` +
        `Resolves YES iff close ${spec.comparator} ${spec.threshold} ${spec.currency}. Tie resolves NO. ` +
        `A non-trading close date settles on the prior session.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  if (spec.kind === 'space') {
    const closeMs = parseUtc(spec.closeUtc);
    const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
    const deadlineMs = parseUtc(spec.deadlineUtc);
    if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('space deadline too early');
    const source = `https://ll.thespacedevs.com/2.2.0/launch/${spec.launchId}/`;
    const criteria =
      `Kind: space\n` +
      `Provider: ll2\n` +
      `LaunchId: ${spec.launchId}\n` +
      `ResolveAfter: ${spec.resolveAfterUtc}\n` +
      `Field: mission_success\n` +
      `SuccessStatusIds: 3\n` +
      `TieBreak: NO\n`;
    return {
      label: spec.label, category: 'space',
      question: `\u{1F680} Will ${spec.launchName} be a mission success?`,
      description:
        `Binary outcome on ${spec.launchName} (scheduled NET ${spec.scheduledNet}). ` +
        `Resolves YES iff Launch Library 2 marks the launch status as Success (id 3). ` +
        `Failure/partial failure resolves NO. A slip past the resolve deadline auto-cancels the market.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  if (spec.kind === 'sports') {
    const kickoffMs = parseUtc(spec.kickoffUtc);
    const resolveAfterMs = kickoffMs + 3 * 60 * 60_000;
    const closeMs = kickoffMs - 5 * 60_000;
    const deadlineMs = kickoffMs + 7 * 24 * 60 * 60_000;
    if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('sports deadline too early');
    const source = `https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${spec.eventId}`;
    const criteria =
      `Kind: sports\n` +
      `Provider: thesportsdb\n` +
      `EventId: ${spec.eventId}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
      `Field: home_win\n` +
      `TieBreak: NO\n`;
    return {
      label: spec.label, category: 'sports',
      question: `\u{26BD} ${spec.league} - Will ${spec.homeTeam} beat ${spec.awayTeam}?`,
      description:
        `Binary outcome on the full-time score of the ${spec.league} fixture ` +
        `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
        `Resolves YES iff ${spec.homeTeam}'s final score is strictly greater than ${spec.awayTeam}'s. ` +
        `A draw resolves NO. If the match is postponed past the resolve deadline the market is auto-cancelled.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  if (spec.kind === 'weather') {
    const closeMs = parseUtc(spec.closeUtc);
    const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
    const deadlineMs = parseUtc(spec.deadlineUtc);
    if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('weather deadline too early');
    const source = `https://archive-api.open-meteo.com/v1/archive?latitude=${spec.latitude}&longitude=${spec.longitude}`;
    const criteria =
      `Kind: weather\n` +
      `Provider: open-meteo\n` +
      `Latitude: ${spec.latitude}\n` +
      `Longitude: ${spec.longitude}\n` +
      `LocationName: ${spec.locationName}\n` +
      `StartDate: ${spec.startDate}\n` +
      `EndDate: ${spec.endDate}\n` +
      `ResolveAfter: ${spec.resolveAfterUtc}\n` +
      `Field: ${spec.field}\n` +
      `Aggregation: ${spec.aggregation}\n` +
      `Threshold: ${spec.threshold}\n` +
      `TieBreak: NO\n`;
    const isRain = spec.field === 'rainy_days_over';
    return {
      label: spec.label, category: 'weather',
      question: isRain
        ? `\u{2601} Will ${spec.locationName} have more than ${spec.threshold} rainy days during ${spec.startDate} to ${spec.endDate}?`
        : `\u{1F321} Will ${spec.locationName}'s daily high exceed ${spec.threshold}°C any day during ${spec.startDate} to ${spec.endDate}?`,
      description:
        `Binary outcome on daily weather at ${spec.locationName} (${spec.latitude}, ${spec.longitude}) ` +
        `over ${spec.startDate}..${spec.endDate}, via the Open-Meteo archive. ` +
        (isRain
          ? `Resolves YES iff the count of rainy days (precip >= 1mm) is strictly greater than ${spec.threshold}. `
          : `Resolves YES iff the maximum daily high temperature is strictly greater than ${spec.threshold}°C. `) +
        `If the archive is unavailable past the resolve deadline the market auto-cancels.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  // music
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const closeMs = resolveAfterMs - 5 * 60_000;
  const deadlineMs = resolveAfterMs + 2 * 24 * 60 * 60_000;
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('music deadline too early');
  const target = spec.comparisonOp === '==' ? `#${spec.threshold}` : `top-${spec.threshold}`;
  const source = `https://rss.marketingtools.apple.com/api/v2/${spec.country}/music/${spec.chart}/10/songs.json`;
  const criteria =
    `Provider: itunes_rss\n` +
    `Country: ${spec.country}\n` +
    `Chart: ${spec.chart}\n` +
    `TrackId: ${spec.trackId}\n` +
    `ResolveAfter: ${spec.resolveAfterUtc}\n` +
    `Field: position\n` +
    `Comparison: position ${spec.comparisonOp} ${spec.threshold}\n` +
    `TieBreak: NO\n`;
  return {
    label: spec.label, category: 'music',
    question: `\u{1F3B5} Will "${spec.trackName}" by ${spec.artistName} be ${target} on Apple Music ${spec.country.toUpperCase()} most-played at ${spec.resolveAfterUtc}?`,
    description:
      `Binary outcome on the Apple Music ${spec.country.toUpperCase()} ${spec.chart} chart position of ` +
      `"${spec.trackName}" (${spec.artistName}) snapshotted at ${spec.resolveAfterUtc}. ` +
      `Resolves YES iff the track's chart position is ${spec.comparisonOp} ${spec.threshold}. ` +
      `Off-chart resolves NO. If the chart is unavailable past the resolve deadline the market auto-cancels.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

/** Parse each built criteria with the real keeper parser; format errors throw. */
function selfValidate(spec: Spec, m: Market): void {
  if (spec.kind === 'crypto' || spec.kind === 'stock') {
    const parsed = parseResolutionCriteria(m.resolutionCriteria);
    if (!parsed) throw new Error(`${m.label}: crypto/stock criteria failed parser`);
    if (parsed.kind !== spec.kind) throw new Error(`${m.label}: parsed kind ${parsed.kind} != ${spec.kind}`);
  } else if (spec.kind === 'space') {
    parseSpaceCriteria(m.resolutionCriteria);
  } else if (spec.kind === 'sports') {
    parseSportsCriteria(m.resolutionCriteria);
  } else if (spec.kind === 'music') {
    parseMusicCriteria(m.resolutionCriteria);
  } else {
    parseWeatherCriteria(m.resolutionCriteria);
  }
  const now = Date.now();
  if (m.closeTimeMs <= now) throw new Error(`${m.label}: closeTime is not in the future`);
  if (m.resolveDeadlineMs <= m.closeTimeMs) throw new Error(`${m.label}: deadline <= close`);
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
          tx.pure.string(m.category),
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
  const markets = SPECS.map((s) => {
    const m = buildMarket(s);
    selfValidate(s, m);
    return m;
  });
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
  if (dry) { console.log('[DRY RUN]'); return; }

  const resolver = requireHex64(
    'CANON_RESOLVER',
    process.env.PREDICTION_RESOLVER_ADDRESS_OVERRIDE || CANON_RESOLVER,
  );
  const packageId = requireHex64('CANON_PACKAGE_ID', CANON_PACKAGE_ID);
  const cap = requireHex64('CANON_ADMIN_CAP', CANON_ADMIN_CAP);
  const client = new SuiClient({ url: RPC_URL });

  // Discover the AdminCap owner on-chain, then load that exact signer from the
  // keystore (override via PREDICTION_ADMIN_KEY_OVERRIDE if not in keystore).
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
  for (const m of markets) {
    process.stdout.write(`  [${m.category}/${m.label}] creating... `);
    try {
      const id = await createOnChain(client, admin, packageId, cap, resolver, m);
      console.log(id);
      created.push({ label: m.label, id });
      await new Promise((r) => setTimeout(r, 4000));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nCreated ${created.length}/${markets.length}:`);
  for (const c of created) console.log(`  ${c.label}: ${c.id}`);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
