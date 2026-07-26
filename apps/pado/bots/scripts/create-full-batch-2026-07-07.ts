/**
 * Prediction-market batch (2026-07-07, devnet v8 "V10-v8reset").
 *
 * Four auto-resolvable categories, every line verified live this session
 * against the exact upstream the keeper resolves with:
 *   crypto   (Binance spot)             -> 4  (BTC/ETH/SOL, one downside)
 *   stock    (Twelve Data + Yahoo)      -> 4  (NVDA/AAPL/TSLA + Samsung 005930.KS)
 *   sports   (TheSportsDB)              -> 3  (FIFA World Cup 2026 knockout, over/under)
 *   weather  (Open-Meteo archive)       -> 3  (Seoul/Tokyo, Jul 8-14 window)
 *
 * Canonical ids pinned from packages/devnet-config/devnet-ids.json
 * ("V10-v8reset"), identical to the 2026-06-30 batch:
 *   package   0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9 (Immutable)
 *   AdminCap  0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac
 *             owned by admin 0x98f5339a... (keystore alias admin-v8)
 *   resolver  0x5cbc8390... (LIVE keeper wallet, distinct from creator)
 * The committed bots/.env is stale, so package/cap/resolver are hardcoded and
 * the signer is loaded in-memory from ~/.sui/sui_config/sui.keystore (AdminCap
 * owner). Override with PREDICTION_ADMIN_KEY_OVERRIDE only if not in keystore.
 *
 * Live data verified 2026-07-07 ~03:00 UTC (KST noon):
 *   Binance spot: BTC=63356.00  ETH=1779.99  SOL=81.41
 *   Yahoo close:  NVDA=195.55  AAPL=312.66  TSLA=419.77  005930.KS=291250 KRW
 *   TheSportsDB FIFA World Cup (league 4429), status NS:
 *     2513670  Argentina vs Egypt     2026-07-07 16:00:00Z  (R16)
 *     2515305  France vs Morocco      2026-07-09 20:00:00Z  (QF)
 *     2517651  Norway vs England      2026-07-11 21:00:00Z  (QF)
 *
 * Knockout matches are resolved as `total_score_over` (2.5) rather than
 * `home_win`: a penalty-shootout advance leaves a drawn recorded score, so
 * over/under is the only unambiguous binary shape for a one-off knockout.
 *
 * Weather markets observe a *future* window (Jul 8-14) and resolve from the
 * Open-Meteo archive after the window closes; the market close_time is set
 * before the window starts so betting locks before any observation.
 *
 * Every criteria block is self-validated against the real keeper parsers in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-07-07.ts --dry-run
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-07-07.ts            # live
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';
import { parseWeatherCriteria } from '../lib/resolvers/weather.js';
import {
  nextTradingDay,
  sessionCloseUtc,
  localDateString,
  type Market as ExchangeMarket,
} from '../lib/market-holidays.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const CANON_PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const CANON_ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
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
  exchange: ExchangeMarket;
  currency: 'USD' | 'KRW';
  displayName: string;
  threshold: number;
  comparator: Comparator;
  /** Intended reading session (YYYY-MM-DD). Shifted to next trading day. */
  readingDate: string;
}

interface SportsSpec {
  kind: 'sports';
  label: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  /** total_score_over threshold, e.g. 2.5 */
  totalThreshold: number;
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

type Spec = CryptoSpec | StockSpec | SportsSpec | WeatherSpec;

// ===== batch definition =====
const SPECS: Spec[] = [
  // --- crypto: close 2026-07-14 23:59 UTC (~1 week); lines just off spot ---
  { kind: 'crypto', label: 'BTC>65k',  symbol: 'BTCUSDT', display: 'BTC', threshold: 65000, comparator: '>', closeUtc: '2026-07-14 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>1800', symbol: 'ETHUSDT', display: 'ETH', threshold: 1800,  comparator: '>', closeUtc: '2026-07-14 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL>85',   symbol: 'SOLUSDT', display: 'SOL', threshold: 85,    comparator: '>', closeUtc: '2026-07-14 23:59:00 UTC' },
  { kind: 'crypto', label: 'BTC<60k',  symbol: 'BTCUSDT', display: 'BTC', threshold: 60000, comparator: '<', closeUtc: '2026-07-14 23:59:00 UTC' },
  // --- stock: reading session 2026-07-17 (Friday) close ---
  { kind: 'stock', label: 'NVDA>200',  ticker: 'NVDA',      exchange: 'NYSE', currency: 'USD', displayName: 'NVIDIA Corporation',  threshold: 200,    comparator: '>', readingDate: '2026-07-17' },
  { kind: 'stock', label: 'AAPL>320',  ticker: 'AAPL',      exchange: 'NYSE', currency: 'USD', displayName: 'Apple Inc.',          threshold: 320,    comparator: '>', readingDate: '2026-07-17' },
  { kind: 'stock', label: 'TSLA>430',  ticker: 'TSLA',      exchange: 'NYSE', currency: 'USD', displayName: 'Tesla, Inc.',         threshold: 430,    comparator: '>', readingDate: '2026-07-17' },
  { kind: 'stock', label: 'SEC>300k',  ticker: '005930.KS', exchange: 'KRX',  currency: 'KRW', displayName: 'Samsung Electronics', threshold: 300000, comparator: '>', readingDate: '2026-07-17' },
  // --- sports: FIFA World Cup 2026 knockout, over/under 2.5 goals ---
  { kind: 'sports', label: 'ARG-EGY o2.5', league: 'FIFA World Cup', eventId: '2513670', homeTeam: 'Argentina', awayTeam: 'Egypt',   kickoffUtc: '2026-07-07 16:00:00 UTC', totalThreshold: 2.5 },
  { kind: 'sports', label: 'FRA-MAR o2.5', league: 'FIFA World Cup', eventId: '2515305', homeTeam: 'France',    awayTeam: 'Morocco', kickoffUtc: '2026-07-09 20:00:00 UTC', totalThreshold: 2.5 },
  { kind: 'sports', label: 'NOR-ENG o2.5', league: 'FIFA World Cup', eventId: '2517651', homeTeam: 'Norway',    awayTeam: 'England', kickoffUtc: '2026-07-11 21:00:00 UTC', totalThreshold: 2.5 },
  // --- weather: future window Jul 8-14, resolve after Jul 16 00:00 UTC ---
  {
    kind: 'weather', label: 'Seoul>=33C',
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-07-08', endDate: '2026-07-14',
    field: 'temperature_max_over', aggregation: 'max', threshold: 33, unit: 'C',
    closeUtc: '2026-07-08 00:00:00 UTC', resolveAfterUtc: '2026-07-16 00:00:00 UTC', deadlineUtc: '2026-07-18 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Seoul rain>3d',
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-07-08', endDate: '2026-07-14',
    field: 'rainy_days_over', aggregation: 'count', threshold: 3, unit: ' days',
    closeUtc: '2026-07-08 00:00:00 UTC', resolveAfterUtc: '2026-07-16 00:00:00 UTC', deadlineUtc: '2026-07-18 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Tokyo>=34C',
    locationName: 'Tokyo', latitude: 35.6762, longitude: 139.6503,
    startDate: '2026-07-08', endDate: '2026-07-14',
    field: 'temperature_max_over', aggregation: 'max', threshold: 34, unit: 'C',
    closeUtc: '2026-07-08 00:00:00 UTC', resolveAfterUtc: '2026-07-16 00:00:00 UTC', deadlineUtc: '2026-07-18 00:00:00 UTC',
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
  category: 'crypto' | 'finance' | 'sports' | 'weather';
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildCrypto(spec: CryptoSpec): Market {
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
    question: `Will ${spec.display} be ${spec.comparator === '>' ? 'above' : 'below'} $${spec.threshold.toLocaleString('en-US')} on ${spec.closeUtc.slice(0, 10)}?`,
    description:
      `Binary outcome on the Binance ${spec.symbol} spot price read at ${spec.closeUtc}. ` +
      `Resolves YES iff price ${spec.comparator} ${spec.threshold} USD. Tie resolves NO.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildStock(spec: StockSpec): Market {
  // Shift the intended reading date to the next real trading day, then take
  // that session's regular close in UTC. The keeper derives the same session
  // date from close_time, so close_time IS the reading instruction.
  const target = new Date(`${spec.readingDate}T12:00:00Z`);
  const tradingDay = nextTradingDay(spec.exchange, target);
  const closeMs = sessionCloseUtc(spec.exchange, tradingDay);
  const deadlineMs = closeMs + 7 * 24 * 60 * 60_000;
  const sessionDate = localDateString(spec.exchange, new Date(closeMs));
  const source = spec.exchange === 'KRX'
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.ticker)}`
    : `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(spec.ticker)}&interval=1day`;
  const thresholdHuman = `${spec.threshold.toLocaleString('en-US')} ${spec.currency}`;
  const direction = spec.comparator === '>' ? 'above' : 'below';
  const sourceDesc = spec.exchange === 'KRX'
    ? `Price is read from Yahoo Finance (Twelve Data free tier does not list KRX). `
    : `Price is read from Twelve Data with Yahoo Finance as a cross-source check. `;
  const criteria =
    `Source: ${source}\n` +
    `Symbol: ${spec.ticker}\n` +
    `Currency: ${spec.currency}\n` +
    `Reading time: ${fmtUtc(closeMs)}\n` +
    `Comparison: close ${spec.comparator} ${spec.threshold}\n` +
    `Tie-breaking: NO\n`;
  return {
    label: spec.label, category: 'finance',
    question: `Will ${spec.displayName} (${spec.ticker}) close ${direction} ${thresholdHuman} on ${sessionDate}?`,
    description:
      `Daily-close prediction. Resolves YES iff the regular-session close of ${spec.ticker} on ` +
      `${sessionDate} (${spec.exchange}) is ${spec.comparator} ${thresholdHuman}; NO otherwise. ` +
      `${sourceDesc}Pre-market and after-hours prices are not used.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildSports(spec: SportsSpec): Market {
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
    `Field: total_score_over\n` +
    `Threshold: ${spec.totalThreshold}\n` +
    `TieBreak: NO\n`;
  return {
    label: spec.label, category: 'sports',
    question: `${spec.league} - Will ${spec.homeTeam} vs ${spec.awayTeam} have more than ${spec.totalThreshold} total goals?`,
    description:
      `Binary outcome on the full-time (incl. extra time) recorded score of the ${spec.league} fixture ` +
      `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
      `Resolves YES iff the combined goals of both teams is strictly greater than ${spec.totalThreshold}; NO otherwise. ` +
      `Penalty-shootout goals are not counted. If the match is postponed past the resolve deadline the market is auto-cancelled.`,
    resolutionSource: source, resolutionCriteria: criteria,
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
  const verb = spec.field === 'rainy_days_over'
    ? `more than ${spec.threshold} rainy days`
    : spec.field === 'temperature_max_over'
      ? `a daily high above ${spec.threshold}${spec.unit} on any day`
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

function buildMarket(spec: Spec): Market {
  switch (spec.kind) {
    case 'crypto': return buildCrypto(spec);
    case 'stock': return buildStock(spec);
    case 'sports': return buildSports(spec);
    case 'weather': return buildWeather(spec);
  }
}

/** Parse each built criteria with the real keeper parser; format errors throw. */
function selfValidate(spec: Spec, m: Market): void {
  if (spec.kind === 'crypto') {
    const parsed = parseResolutionCriteria(m.resolutionCriteria);
    if (!parsed) throw new Error(`${m.label}: crypto criteria failed parser`);
    if (parsed.kind !== 'crypto') throw new Error(`${m.label}: parsed kind ${parsed.kind} != crypto`);
  } else if (spec.kind === 'stock') {
    const parsed = parseResolutionCriteria(m.resolutionCriteria);
    if (!parsed) throw new Error(`${m.label}: stock criteria failed parser`);
    if (parsed.kind !== 'stock') throw new Error(`${m.label}: parsed kind ${parsed.kind} != stock`);
    if (parsed.currency !== spec.currency) throw new Error(`${m.label}: currency ${parsed.currency} != ${spec.currency}`);
  } else if (spec.kind === 'sports') {
    const c = parseSportsCriteria(m.resolutionCriteria);
    if (c.field !== 'total_score_over') throw new Error(`${m.label}: sports field != total_score_over`);
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
