/**
 * Prediction-market batch creator, 2026-10-09.
 *
 * Motivation: the live OPEN slate on this date was 6 markets (1 EPL fixture
 * closing 10-10, three Binance crypto markets and two NYSE close markets all
 * closing 10-20). Nothing at all between 10-20 and the end of the year, and
 * four of the seven keeper resolvers unused.
 *
 * Seven auto-resolvable categories, deadlines spread from ~18 hours to ~3
 * months. Every identifier below was read out of the exact upstream the keeper
 * resolves with, on 2026-10-09, and is re-checkable with --verify. Nothing is
 * fabricated:
 *
 *   crypto  (Binance ticker, CoinGecko fallback)    -> 10   1d .. 90d
 *   stock   (Twelve Data + Yahoo cross-check)       ->  4   5d .. 40d
 *   ufc     (ESPN core API)                         ->  6   10-10 .. 11-07
 *   sports  (TheSportsDB, 4 leagues)                -> 10   10-10 .. 11-20
 *   weather (Open-Meteo archive)                    ->  7   10-18 .. 11-23
 *   space   (Launch Library 2)                      ->  3   10-13 .. 10-19
 *   music   (Apple Music RSS)                       ->  4   10-13 .. 10-23
 *
 * Deliberately excluded (2026-10-09):
 *   - esports (LCK): lolesports getSchedule has pages.newer=null and the last
 *     event is the 2026-09-13 final. The 2027 season is not published, so
 *     there is no real upcoming series to name.
 *
 * Calibration notes, so no market is a foregone conclusion:
 *   - crypto/stock thresholds are a percentage bias off the price fetched live
 *     at run time, not off a price pasted into this file. The bias mix per
 *     asset spans easy / medium / hard and is not uniformly bullish.
 *   - weather thresholds sit near the 2019-2025 median of the *same calendar
 *     window*, read from the Open-Meteo archive on 2026-10-09, and were then
 *     nudged toward the current 16-day forecast where one exists. Historical
 *     values per window (see each spec) give a 3-4 of 7 hit rate:
 *       Seoul  Tmax 10-12..10-18: 21.1 20.0 23.2 21.0 22.1 23.2 24.0 (median 22.1,
 *              forecast peak 26.9 -- the pattern is warm, so the line is 26.0)
 *       Tokyo  rain 10-14..10-23: 116.3 55.9 42.1 32.5 47.5 9.0 48.7 (median 47.5,
 *              forecast only 15.9 at 10d range, so the line is 30.0)
 *       London rainy days 10-13..10-26: 8 6 7 9 7 7 5 (median 7, line > 6)
 *       NYC    Tmax mean 10-15..10-28: 17.1 18.4 19.9 16.9 19.3 20.1 16.5 (median 18.4)
 *       SIN    rain 10-20..11-03: 289.4 251.7 229.8 162.8 176.9 110.4 62.2 (median 176.9)
 *       Seoul  Tmax 11-02..11-08: 18.5 16.8 19.2 16.0 23.0 22.6 18.0 (median 18.5)
 *       Sydney Tmax mean 11-10..11-23: 25.8 26.1 21.1 22.9 23.6 23.6 24.7 (median 23.6)
 *     The archive was returning non-null daily values through 2026-10-09 (same
 *     day) when this was written, so ResolveAfter = EndDate + 36h is a wide margin.
 *   - music lines mix "still #1" on a current #1 and "reaches top-3" on a
 *     track currently outside it.
 *   - space uses two distinct LaunchIds. LL2 cost is per distinct launch id
 *     (6 req/hr each), the box keeper has LL2_API_KEY so the ceiling is 34/hr,
 *     and two launches spend 12 -- see the shared-quota note in
 *     lib/resolvers/space.ts before adding more.
 *
 * Canonical v8 ids pinned from packages/devnet-config/devnet-ids.json:
 *   package   0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9 (Immutable)
 *   AdminCap  0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac
 *             owned by admin 0x98f5339a... (keystore alias admin-v8)
 *   resolver  0x5cbc8390... (LIVE keeper wallet, distinct from the creator)
 * The committed bots/.env is stale (v7 package/cap/resolver), so these are
 * hardcoded. Do not pass --env-file. A market created with any other resolver
 * is an orphan: nothing resolves it and nothing expires it.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY   creator wallet key (the AdminCap holder; only secret)
 *
 * Usage:
 *   npx tsx scripts/create-full-batch-2026-10-09.ts --dry-run --verify
 *   PREDICTION_ADMIN_KEY=... npx tsx scripts/create-full-batch-2026-10-09.ts --verify
 *
 * Resuming: create_market has no dedup and `question` is immutable, so never
 * re-run the whole batch after a partial failure. --only takes a
 * comma-separated list of categories (crypto, stock, ufc, sports, weather,
 * space, music) and/or exact market labels; the failure list printed at the
 * end is already in that format.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { nextTradingDay, sessionCloseUtc, localDateString } from '../lib/market-holidays.js';
import { createMarketOnChain, type CreateMarketParams } from '../lib/create-market-tx.js';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';
import { parseUfcCriteria } from '../lib/resolvers/ufc.js';
import { parseWeatherCriteria } from '../lib/resolvers/weather.js';
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseMusicCriteria } from '../lib/resolvers/music.js';
import { detectKind } from '../lib/resolvers/types.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CANON_PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const CANON_ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
const CANON_RESOLVER = '0x5cbc8390ae709b0358f304fd76691dda1f03eae514a9592153125c8cff23aeb0';

const ESPN_BASE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const LL2_BASE = 'https://ll.thespacedevs.com/2.2.0';
const ITUNES_BASE = 'https://rss.marketingtools.apple.com';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';

const FETCH_TIMEOUT_MS = 15_000;
// TheSportsDB free tier (key=3) returns intermittent 503s regardless of
// pacing: on 2026-10-09, 2 of 5 identical requests 5s apart failed. So pace
// the loop *and* retry each lookup, or a healthy fixture reads as drifted.
const SPORTSDB_PACING_MS = 2500;
const SPORTSDB_ATTEMPTS = 4;
const SPORTSDB_BACKOFF_MS = 4000;

// ============================================================
// Shared helpers
// ============================================================

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

interface GetJsonOpts {
  headers?: Record<string, string>;
  /** Total attempts, including the first. */
  attempts?: number;
  backoffMs?: number;
}

// Retries a transient failure (5xx, 429, timeout, socket error). A 4xx other
// than 429 is a real identifier problem and must not be retried into silence,
// because retrying it would turn "this event does not exist" into a timeout.
async function getJson<T>(url: string, opts: GetJsonOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 2;
  const backoffMs = opts.backoffMs ?? 2000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} on ${url}`);
        if (res.status < 500 && res.status !== 429) throw err;
        lastErr = err;
      } else {
        return (await res.json()) as T;
      }
    } catch (err) {
      if (err instanceof Error && /^HTTP 4/.test(err.message) && !err.message.startsWith('HTTP 429')) throw err;
      lastErr = err;
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, backoffMs * attempt));
  }
  throw lastErr;
}

type Market = CreateMarketParams;

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// ============================================================
// Crypto (live Binance price at run time)
// ============================================================

interface CryptoSpec {
  symbol: string;
  binanceSymbol: string;
  displayName: string;
  decimals: number;
  hours: number;
  biasPct: number;
}

// Reference prices observed on 2026-10-09 (informing the bias mix only; the
// threshold is computed off a fresh tick at run time): BTC 82,354.10,
// ETH 2,490.84, SOL 110.27, BNB 740.38, XRP 1.3944, DOGE 0.08503.
const CRYPTO_SPECS: CryptoSpec[] = [
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0, hours: 24, biasPct: 0.8 },
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hours: 48, biasPct: -1.5 },
  { symbol: 'SOL', binanceSymbol: 'SOLUSDT', displayName: 'Solana', decimals: 2, hours: 96, biasPct: 3 },
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0, hours: 24 * 7, biasPct: 4 },
  { symbol: 'XRP', binanceSymbol: 'XRPUSDT', displayName: 'XRP', decimals: 4, hours: 24 * 7, biasPct: 6 },
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hours: 24 * 14, biasPct: 7 },
  { symbol: 'DOGE', binanceSymbol: 'DOGEUSDT', displayName: 'Dogecoin', decimals: 5, hours: 24 * 21, biasPct: 10 },
  { symbol: 'BNB', binanceSymbol: 'BNBUSDT', displayName: 'BNB', decimals: 2, hours: 24 * 30, biasPct: 8 },
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0, hours: 24 * 45, biasPct: 12 },
  { symbol: 'SOL', binanceSymbol: 'SOLUSDT', displayName: 'Solana', decimals: 2, hours: 24 * 90, biasPct: 25 },
];
// Short on purpose: the keeper prices a crypto market off a live tick, so a
// settlement long after close_time would judge the past with today's price.
const CRYPTO_RESOLVE_BUFFER_MS = 2 * HOUR;

const cryptoLabel = (s: CryptoSpec) => `${s.symbol} ${s.hours / 24}d`;

// One fetch per symbol: the same asset is listed at several horizons, and
// pricing them off different ticks would give each a slightly different base.
const priceCache = new Map<string, Promise<number>>();
function cachedPrice(key: string, fetcher: () => Promise<number>): Promise<number> {
  let p = priceCache.get(key);
  if (!p) { p = fetcher(); priceCache.set(key, p); }
  return p;
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  const j = await getJson<{ price: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  const p = parseFloat(j.price);
  if (!Number.isFinite(p) || p <= 0) throw new Error(`Bad price for ${symbol}: ${j.price}`);
  return p;
}

function roundToDecimals(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

async function buildCryptoMarkets(now: number, specs: CryptoSpec[]): Promise<Market[]> {
  const out: Market[] = [];
  for (const spec of specs) {
    const livePrice = await cachedPrice(`binance:${spec.binanceSymbol}`, () => fetchBinancePrice(spec.binanceSymbol));
    const threshold = roundToDecimals(livePrice * (1 + spec.biasPct / 100), spec.decimals);
    const closeTimeMs = now + spec.hours * HOUR;
    const resolveDeadlineMs = closeTimeMs + CRYPTO_RESOLVE_BUFFER_MS;
    const readingTime = fmtUtc(closeTimeMs);
    const sourceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${spec.binanceSymbol}`;
    const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals });
    out.push({
      label: cryptoLabel(spec),
      question: `Will ${spec.displayName} (${spec.symbol}/USDT) close above $${fmt(threshold)} on Binance at ${readingTime}?`,
      description:
        `Binary spot-price prediction. Resolves YES if the Binance ticker for ${spec.binanceSymbol} ` +
        `reports a price > ${fmt(threshold)} USDT at the reading time; NO otherwise. Reference price ` +
        `at market creation: $${fmt(livePrice)}. CoinGecko is used as a fallback price source if Binance is unavailable.`,
      category: 'crypto',
      resolutionSource: sourceUrl,
      resolutionCriteria: `Source: ${sourceUrl}\nReading time: ${readingTime}\nComparison: price > ${threshold}\nTie-breaking: NO`,
      closeTimeMs,
      resolveDeadlineMs,
    });
  }
  return out;
}

// ============================================================
// Stock (live Yahoo quote at run time; Twelve Data primary at resolution)
// ============================================================

interface StockSpec {
  ticker: string;
  displayName: string;
  daysFromNow: number;
  biasPct: number;
}

// Reference prices observed on 2026-10-09: NVDA 230.48, AAPL 340.42,
// TSLA 375.00, MSFT 522.61.
const STOCK_SPECS: StockSpec[] = [
  { ticker: 'NVDA', displayName: 'NVIDIA Corporation', daysFromNow: 5, biasPct: 2 },
  { ticker: 'AAPL', displayName: 'Apple Inc.', daysFromNow: 12, biasPct: 3 },
  { ticker: 'TSLA', displayName: 'Tesla, Inc.', daysFromNow: 25, biasPct: 6 },
  { ticker: 'MSFT', displayName: 'Microsoft Corporation', daysFromNow: 40, biasPct: 5 },
];
// Twelve Data is queried with outputsize=5, so a session more than five
// trading days behind the settlement attempt throws instead of resolving.
// 5 calendar days is ~3 trading days of slack and still leaves the refund path.
const STOCK_RESOLVE_BUFFER_MS = 5 * DAY;

const stockLabel = (s: StockSpec) => `${s.ticker} ${s.daysFromNow}d`;

async function fetchYahooQuote(ticker: string): Promise<number> {
  const j = await getJson<{ chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new Error(`Bad Yahoo quote for ${ticker}`);
  }
  return price;
}

async function buildStockMarkets(now: number, specs: StockSpec[]): Promise<Market[]> {
  const out: Market[] = [];
  for (const spec of specs) {
    const livePrice = await cachedPrice(`yahoo:${spec.ticker}`, () => fetchYahooQuote(spec.ticker));
    const threshold = Math.round(livePrice * (1 + spec.biasPct / 100));
    const tradingDay = nextTradingDay('NYSE', new Date(now + spec.daysFromNow * DAY));
    const closeTimeMs = sessionCloseUtc('NYSE', tradingDay);
    const resolveDeadlineMs = closeTimeMs + STOCK_RESOLVE_BUFFER_MS;
    const sessionDate = localDateString('NYSE', tradingDay);
    const sourceUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(spec.ticker)}&interval=1day`;
    out.push({
      label: stockLabel(spec),
      question: `Will ${spec.displayName} (${spec.ticker}) close above $${threshold} on ${sessionDate}?`,
      description:
        `Daily-close prediction. Resolves YES if the regular-session close of ${spec.ticker} on ${sessionDate} ` +
        `(NYSE calendar) is > ${threshold}; NO otherwise. Price is read from Twelve Data with Yahoo Finance as a ` +
        `cross-source check (5% agreement required). Reference price at market creation: $${livePrice.toFixed(2)}. ` +
        `Pre-market and after-hours prices are not used.`,
      category: 'finance',
      resolutionSource: sourceUrl,
      resolutionCriteria:
        `Source: ${sourceUrl}\nSymbol: ${spec.ticker}\nCurrency: USD\n` +
        `Reading time: ${fmtUtc(closeTimeMs)}\nComparison: close > ${threshold}\nTie-breaking: NO`,
      closeTimeMs,
      resolveDeadlineMs,
    });
  }
  return out;
}

// ============================================================
// UFC (ESPN core API, pre-flight verified)
// ============================================================

interface UfcSpec {
  eventId: string;
  competitionId: string;
  athleteAId: string;
  athleteBId: string;
  fighterA: string;
  fighterB: string;
  eventName: string;
  fightStartUtc: string;   // ESPN event (card) start
}

// All five events and six bouts below were read on 2026-10-09 from
// sports.core.api.espn.com .../ufc/events?dates=20261009-20261231, then each
// competition's competitors were dereferenced to athlete displayName.
const UFC_SPECS: UfcSpec[] = [
  {
    eventId: '600061541', competitionId: '401916276',
    athleteAId: '4025699', athleteBId: '4848674',
    fighterA: 'Brendan Allen', fighterB: 'Christian Leroy Duncan',
    eventName: 'Fight Night: Allen vs. Duncan', fightStartUtc: '2026-10-10 21:00:00 UTC',
  },
  {
    eventId: '600060773', competitionId: '401897388',
    athleteAId: '4024714', athleteBId: '3165120',
    fighterA: 'Joaquin Buckley', fighterB: 'Mike Malott',
    eventName: 'Fight Night: Buckley vs. Malott', fightStartUtc: '2026-10-17 21:00:00 UTC',
  },
  {
    eventId: '600061267', competitionId: '401911632',
    athleteAId: '3949584', athleteBId: '4029275',
    fighterA: 'Alexander Volkanovski', fighterB: 'Movsar Evloev',
    eventName: '333: Volkanovski vs. Evloev', fightStartUtc: '2026-10-24 14:00:00 UTC',
  },
  {
    eventId: '600061267', competitionId: '401911633',
    athleteAId: '3948572', athleteBId: '4293517',
    fighterA: 'Merab Dvalishvili', fighterB: 'Petr Yan',
    eventName: '333: Dvalishvili vs. Yan', fightStartUtc: '2026-10-24 14:00:00 UTC',
  },
  {
    eventId: '600061420', competitionId: '401921310',
    athleteAId: '3028863', athleteBId: '5144007',
    fighterA: 'Renato Moicano', fighterB: 'Tom Nolan',
    eventName: 'Fight Night: Moicano vs. Nolan', fightStartUtc: '2026-10-31 21:00:00 UTC',
  },
  {
    eventId: '600061268', competitionId: '401911641',
    athleteAId: '4921516', athleteBId: '4295192',
    fighterA: 'Gabriel Bonfim', fighterB: 'Sean Brady',
    eventName: 'Fight Night: Bonfim vs. Brady', fightStartUtc: '2026-11-07 22:00:00 UTC',
  },
];

const ufcLabel = (s: UfcSpec) => `UFC ${s.fighterA} vs ${s.fighterB}`;

interface EspnCompetitor { athleteId: string; displayName: string }

async function fetchEspnCompetitors(eventId: string, compId: string): Promise<EspnCompetitor[]> {
  const comp = await getJson<{ competitors?: Array<{ athlete?: { $ref?: string } | null }> | null }>(
    `${ESPN_BASE}/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(compId)}`,
  );
  const out: EspnCompetitor[] = [];
  for (const c of comp.competitors ?? []) {
    const ref = c.athlete?.$ref;
    if (!ref) continue;
    const m = /\/athletes\/(\d+)(?:\?|$)/.exec(ref);
    if (!m) continue;
    const ath = await getJson<{ displayName?: string }>(ref.replace(/^http:/, 'https:'));
    out.push({ athleteId: m[1], displayName: ath.displayName ?? '' });
  }
  return out;
}

async function verifyUfcSpec(spec: UfcSpec): Promise<void> {
  const competitors = await fetchEspnCompetitors(spec.eventId, spec.competitionId);
  const describe = competitors.map((c) => `${c.athleteId} (${c.displayName})`).join(', ');
  const a = competitors.find((c) => c.athleteId === spec.athleteAId);
  const b = competitors.find((c) => c.athleteId === spec.athleteBId);
  if (!a) throw new Error(`AthleteAId ${spec.athleteAId} not on ESPN fight ${spec.competitionId}. ESPN has: ${describe}`);
  if (!b) throw new Error(`AthleteBId ${spec.athleteBId} not on ESPN fight ${spec.competitionId}. ESPN has: ${describe}`);
  // Case-insensitive: ESPN varies punctuation ("O'Malley" vs "OMalley").
  if (a.displayName.toLowerCase() !== spec.fighterA.toLowerCase()) {
    throw new Error(`FighterA name mismatch: spec='${spec.fighterA}' ESPN='${a.displayName}'`);
  }
  if (b.displayName.toLowerCase() !== spec.fighterB.toLowerCase()) {
    throw new Error(`FighterB name mismatch: spec='${spec.fighterB}' ESPN='${b.displayName}'`);
  }

  // closeTime is derived from fightStartUtc, so a rescheduled card would
  // otherwise leave trading open past the fight.
  const ev = await getJson<{ date?: string }>(`${ESPN_BASE}/events/${encodeURIComponent(spec.eventId)}`);
  const evMs = Date.parse(ev.date ?? '');
  if (!Number.isFinite(evMs) || Math.abs(evMs - parseUtc(spec.fightStartUtc)) > 60_000) {
    throw new Error(`card start drift: spec ${spec.fightStartUtc} vs ESPN ${ev.date}`);
  }
  const comp = await getJson<{ status?: { $ref?: string } | null }>(
    `${ESPN_BASE}/events/${encodeURIComponent(spec.eventId)}/competitions/${encodeURIComponent(spec.competitionId)}`,
  );
  const statusRef = comp.status?.$ref;
  if (!statusRef) throw new Error('competition has no status ref');
  const status = await getJson<{ type?: { state?: string } | null }>(statusRef.replace(/^http:/, 'https:'));
  if (status.type?.state !== 'pre') throw new Error(`bout is not pre-fight (state=${status.type?.state})`);
}

function buildUfcMarket(spec: UfcSpec): Market {
  const fightStartMs = parseUtc(spec.fightStartUtc);
  const resolveAfterMs = fightStartMs + 4 * HOUR;
  const closeTimeMs = fightStartMs - 5 * 60_000;
  const resolveDeadlineMs = fightStartMs + 7 * DAY;
  return {
    label: ufcLabel(spec),
    question: `🥊 UFC ${spec.eventName}: Will ${spec.fighterA} beat ${spec.fighterB}?`,
    description:
      `Binary outcome on the official ESPN result of the UFC ${spec.eventName} bout ${spec.fighterA} vs ` +
      `${spec.fighterB} (card start ${spec.fightStartUtc}; trading closes 5 minutes before the card starts). ` +
      `Resolves YES iff ${spec.fighterA} is declared the winner. Resolves NO iff ${spec.fighterB} is declared ` +
      `the winner. A No Contest, Draw, or a bout cancelled past the resolve deadline leaves the market to be ` +
      `auto-cancelled (stakes refunded).`,
    category: 'sports',
    resolutionSource: `${ESPN_BASE}/events/${spec.eventId}/competitions/${spec.competitionId}`,
    resolutionCriteria:
      `Kind: ufc\nProvider: espn\n` +
      `EventId: ${spec.eventId}\nCompetitionId: ${spec.competitionId}\n` +
      `FighterA: ${spec.fighterA}\nFighterB: ${spec.fighterB}\n` +
      `AthleteAId: ${spec.athleteAId}\nAthleteBId: ${spec.athleteBId}\n` +
      `Field: fighter_a_wins\nResolveAfter: ${fmtUtc(resolveAfterMs)}\n`,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

// ============================================================
// Sports / football (TheSportsDB, pre-flight verified)
// ============================================================

interface SportsSpec {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffUtc: string;
  field: 'home_win' | 'total_score_over';
  threshold?: number;
}

// Every row below was read on 2026-10-09 from TheSportsDB
// lookupevent.php?id=<eventId>: strHomeTeam / strAwayTeam / strTimestamp
// matched exactly and strStatus was 'NS' (not started).
const SPORTS_SPECS: SportsSpec[] = [
  { eventId: '2506239', homeTeam: 'Barcelona', awayTeam: 'Getafe', league: 'La Liga', kickoffUtc: '2026-10-10 16:30:00 UTC', field: 'home_win' },
  { eventId: '2506242', homeTeam: 'Real Madrid', awayTeam: 'Villarreal', league: 'La Liga', kickoffUtc: '2026-10-10 19:00:00 UTC', field: 'home_win' },
  { eventId: '2506255', homeTeam: 'Real Betis', awayTeam: 'Barcelona', league: 'La Liga', kickoffUtc: '2026-10-17 16:30:00 UTC', field: 'home_win' },
  { eventId: '2482210', homeTeam: 'Napoli', awayTeam: 'Roma', league: 'Serie A', kickoffUtc: '2026-10-24 16:00:00 UTC', field: 'home_win' },
  { eventId: '2494073', homeTeam: 'Chelsea', awayTeam: 'Tottenham Hotspur', league: 'Premier League', kickoffUtc: '2026-10-24 16:30:00 UTC', field: 'home_win' },
  { eventId: '2494084', homeTeam: 'Chelsea', awayTeam: 'Manchester United', league: 'Premier League', kickoffUtc: '2026-10-31 12:30:00 UTC', field: 'total_score_over', threshold: 2.5 },
  { eventId: '2508396', homeTeam: 'Bayern Munich', awayTeam: 'Borussia Dortmund', league: 'Bundesliga', kickoffUtc: '2026-10-31 17:30:00 UTC', field: 'home_win' },
  { eventId: '2482230', homeTeam: 'AC Milan', awayTeam: 'Inter Milan', league: 'Serie A', kickoffUtc: '2026-10-31 19:45:00 UTC', field: 'home_win' },
  { eventId: '2494098', homeTeam: 'Nottingham Forest', awayTeam: 'Manchester City', league: 'Premier League', kickoffUtc: '2026-11-07 17:30:00 UTC', field: 'home_win' },
  { eventId: '2508414', homeTeam: 'Bayern Munich', awayTeam: 'Köln', league: 'Bundesliga', kickoffUtc: '2026-11-20 19:30:00 UTC', field: 'total_score_over', threshold: 3.5 },
];

const sportsLabel = (s: SportsSpec) =>
  s.field === 'home_win' ? `${s.homeTeam} vs ${s.awayTeam}` : `${s.homeTeam} vs ${s.awayTeam} o${s.threshold}`;

async function verifySportsSpec(spec: SportsSpec): Promise<void> {
  const j = await getJson<{ events?: Array<{ strHomeTeam?: string; strAwayTeam?: string; strTimestamp?: string; strStatus?: string }> }>(
    `${SPORTSDB_BASE}/lookupevent.php?id=${spec.eventId}`,
    { attempts: SPORTSDB_ATTEMPTS, backoffMs: SPORTSDB_BACKOFF_MS },
  );
  const e = j.events?.[0];
  if (!e) throw new Error(`eventId ${spec.eventId} not found on TheSportsDB`);
  if (e.strHomeTeam?.toLowerCase() !== spec.homeTeam.toLowerCase()) {
    throw new Error(`home team mismatch: spec='${spec.homeTeam}' TheSportsDB='${e.strHomeTeam}'`);
  }
  if (e.strAwayTeam?.toLowerCase() !== spec.awayTeam.toLowerCase()) {
    throw new Error(`away team mismatch: spec='${spec.awayTeam}' TheSportsDB='${e.strAwayTeam}'`);
  }
  // closeTime = kickoff - 5min, so a same-day re-slot must fail here too.
  const iso = (e.strTimestamp ?? '').replace(' ', 'T');
  const apiMs = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (!Number.isFinite(apiMs) || Math.abs(apiMs - parseUtc(spec.kickoffUtc)) > 60_000) {
    throw new Error(`kickoff drift: spec ${spec.kickoffUtc} vs TheSportsDB ${e.strTimestamp}`);
  }
  if (e.strStatus && !['NS', 'Not Started', ''].includes(e.strStatus)) {
    throw new Error(`fixture no longer scheduled (strStatus='${e.strStatus}')`);
  }
}

function buildSportsMarket(spec: SportsSpec): Market {
  const kickoffMs = parseUtc(spec.kickoffUtc);
  const resolveAfterMs = kickoffMs + 3 * HOUR;
  const closeTimeMs = kickoffMs - 5 * 60_000;
  const resolveDeadlineMs = kickoffMs + 7 * DAY;
  const totals = spec.field === 'total_score_over';
  if (totals && typeof spec.threshold !== 'number') {
    throw new Error(`${sportsLabel(spec)}: total_score_over needs a threshold`);
  }
  const criteria =
    `Kind: sports\nProvider: thesportsdb\n` +
    `EventId: ${spec.eventId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: ${spec.field}\n` +
    (totals ? `Threshold: ${spec.threshold}\n` : '') +
    `TieBreak: NO\n`;
  const question = totals
    ? `⚽ ${spec.league} - Will ${spec.homeTeam} vs ${spec.awayTeam} produce more than ${spec.threshold} goals?`
    : `⚽ ${spec.league} - Will ${spec.homeTeam} beat ${spec.awayTeam}?`;
  const description = totals
    ? `Binary outcome on the full-time score of the ${spec.league} fixture ${spec.homeTeam} vs ${spec.awayTeam} ` +
      `(kickoff ${spec.kickoffUtc}). Resolves YES iff the combined final score of both teams is strictly greater ` +
      `than ${spec.threshold}; NO otherwise. Extra time counts only where TheSportsDB records it in the final ` +
      `score. If the match is postponed past the resolve deadline the market is auto-cancelled.`
    : `Binary outcome on the full-time score of the ${spec.league} fixture ${spec.homeTeam} vs ${spec.awayTeam} ` +
      `(kickoff ${spec.kickoffUtc}). Resolves YES iff ${spec.homeTeam}'s final score is strictly greater than ` +
      `${spec.awayTeam}'s. A draw resolves NO. If the match is postponed past the resolve deadline the market is ` +
      `auto-cancelled.`;
  return {
    label: sportsLabel(spec),
    question,
    description,
    category: 'sports',
    resolutionSource: `${SPORTSDB_BASE}/lookupevent.php?id=${spec.eventId}`,
    resolutionCriteria: criteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

// ============================================================
// Weather (Open-Meteo archive)
// ============================================================

interface WeatherSpec {
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
}

// Thresholds calibrated against 2019-2025 archive values for the same calendar
// window (see the header note for the per-window series).
const WEATHER_SPECS: WeatherSpec[] = [
  { label: 'Seoul Tmax 10-18', locationName: 'Seoul', latitude: 37.5665, longitude: 126.978, startDate: '2026-10-12', endDate: '2026-10-18', field: 'temperature_max_over', aggregation: 'max', threshold: 26, unit: '°C' },
  { label: 'Tokyo rain 10-23', locationName: 'Tokyo', latitude: 35.6762, longitude: 139.6503, startDate: '2026-10-14', endDate: '2026-10-23', field: 'precipitation_sum_over', aggregation: 'sum', threshold: 30, unit: 'mm' },
  { label: 'London rainydays 10-26', locationName: 'London', latitude: 51.5074, longitude: -0.1278, startDate: '2026-10-13', endDate: '2026-10-26', field: 'rainy_days_over', aggregation: 'count', threshold: 6, unit: ' days' },
  { label: 'NYC Tmean 10-28', locationName: 'New York', latitude: 40.7128, longitude: -74.006, startDate: '2026-10-15', endDate: '2026-10-28', field: 'temperature_max_over', aggregation: 'mean', threshold: 18.5, unit: '°C' },
  { label: 'Singapore rain 11-03', locationName: 'Singapore', latitude: 1.3521, longitude: 103.8198, startDate: '2026-10-20', endDate: '2026-11-03', field: 'precipitation_sum_over', aggregation: 'sum', threshold: 170, unit: 'mm' },
  { label: 'Seoul Tmax 11-08', locationName: 'Seoul', latitude: 37.5665, longitude: 126.978, startDate: '2026-11-02', endDate: '2026-11-08', field: 'temperature_max_over', aggregation: 'max', threshold: 19, unit: '°C' },
  { label: 'Sydney Tmean 11-23', locationName: 'Sydney', latitude: -33.8688, longitude: 151.2093, startDate: '2026-11-10', endDate: '2026-11-23', field: 'temperature_max_over', aggregation: 'mean', threshold: 24, unit: '°C' },
];

function buildWeatherMarket(spec: WeatherSpec): Market {
  const endMs = Date.parse(`${spec.endDate}T00:00:00Z`);
  if (!Number.isFinite(endMs)) throw new Error(`${spec.label}: bad endDate`);
  // Trading closes as the final observation day begins; the archive is read
  // 36h after that day ends (it was current to the same day on 2026-10-09).
  const closeTimeMs = endMs;
  const resolveAfterMs = endMs + DAY + 36 * HOUR;
  const resolveDeadlineMs = endMs + 14 * DAY;
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) throw new Error(`${spec.label}: deadline too early`);
  const fieldDesc: Record<WeatherSpec['field'], string> = {
    temperature_max_over: 'the daily maximum temperature',
    precipitation_sum_over: 'the daily precipitation sum',
    rainy_days_over: 'the number of rainy days (precip > 1mm)',
  };
  const verb = spec.field === 'rainy_days_over'
    ? `more than ${spec.threshold} rainy days`
    : spec.field === 'precipitation_sum_over'
      ? `more than ${spec.threshold}${spec.unit} of total precipitation`
      : spec.aggregation === 'max'
        ? `a daily high above ${spec.threshold}${spec.unit} on any day`
        : `an average daily high above ${spec.threshold}${spec.unit}`;
  const source = `${ARCHIVE_BASE}?latitude=${spec.latitude}&longitude=${spec.longitude}` +
    `&start_date=${spec.startDate}&end_date=${spec.endDate}&daily=temperature_2m_max,precipitation_sum&timezone=UTC`;
  return {
    label: spec.label,
    category: 'weather',
    question: `Will ${spec.locationName} record ${verb} during ${spec.startDate} through ${spec.endDate}?`,
    description:
      `Binary outcome on Open-Meteo's historical-weather archive for ${spec.locationName} ` +
      `(lat ${spec.latitude}, lon ${spec.longitude}). Resolves YES iff the ${spec.aggregation} of ` +
      `${fieldDesc[spec.field]} across ${spec.startDate} to ${spec.endDate} (inclusive, UTC days) exceeds ` +
      `${spec.threshold}${spec.unit}. The archive is read once after ${fmtUtc(resolveAfterMs)}.`,
    resolutionSource: source,
    resolutionCriteria:
      `Kind: weather\nProvider: open-meteo\n` +
      `Latitude: ${spec.latitude}\nLongitude: ${spec.longitude}\n` +
      `LocationName: ${spec.locationName}\n` +
      `StartDate: ${spec.startDate}\nEndDate: ${spec.endDate}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
      `Field: ${spec.field}\nAggregation: ${spec.aggregation}\n` +
      `Threshold: ${spec.threshold}\nTieBreak: NO\n`,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

async function verifyWeatherSpec(spec: WeatherSpec): Promise<void> {
  // The window is in the future, so only the location is checkable now: ask
  // for the last 7 closed days and require non-null dailies, which is also the
  // freshness assumption behind ResolveAfter = EndDate + 36h.
  const end = new Date(Date.now() - DAY);
  const start = new Date(end.getTime() - 6 * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const variable = spec.field === 'temperature_max_over' ? 'temperature_2m_max' : 'precipitation_sum';
  const j = await getJson<{ daily?: Record<string, Array<number | null>> }>(
    `${ARCHIVE_BASE}?latitude=${spec.latitude}&longitude=${spec.longitude}` +
    `&start_date=${iso(start)}&end_date=${iso(end)}&daily=${variable}&timezone=UTC`,
  );
  const series = j.daily?.[variable];
  if (!series || series.length === 0) throw new Error(`no ${variable} series for ${spec.locationName}`);
  if (series.some((v) => v === null || v === undefined)) {
    throw new Error(`${spec.locationName}: archive has gaps in the last 7 closed days`);
  }
}

// ============================================================
// Space (Launch Library 2)
// ============================================================

interface SpaceSpec {
  label: string;
  launchId: string;
  vehicle: string;
  field: 'mission_success' | 'on_schedule_24h';
  netUtc: string;
  deadlineDays: number;
}

const ON_SCHEDULE_TOLERANCE_SEC = 86400;

// Read on 2026-10-09 from ll.thespacedevs.com/2.2.0/launch/<id>/:
//   bf2c3027-... net 2026-10-13T10:33:44Z "Falcon 9 Block 5 | Dragon CRS-2 SpX-35", status 1 Go
//   69ebbcd2-... net 2026-10-19T19:41:03Z "H3-24 | Martian Moon eXplorer (MMX)",   status 1 Go
// Two distinct launch ids on purpose: LL2 quota is charged per launch id, not
// per market, so the two CRS-2 markets below are free (see space.ts).
const SPACE_SPECS: SpaceSpec[] = [
  {
    label: 'CRS-2 SpX-35 success', launchId: 'bf2c3027-a314-403e-a416-2bfd5d165ad1',
    vehicle: 'Falcon 9 (Dragon CRS-2 SpX-35)', field: 'mission_success',
    netUtc: '2026-10-13 10:33:44 UTC', deadlineDays: 7,
  },
  {
    label: 'CRS-2 SpX-35 on time', launchId: 'bf2c3027-a314-403e-a416-2bfd5d165ad1',
    vehicle: 'Falcon 9 (Dragon CRS-2 SpX-35)', field: 'on_schedule_24h',
    netUtc: '2026-10-13 10:33:44 UTC', deadlineDays: 10,
  },
  {
    label: 'H3 MMX success', launchId: '69ebbcd2-b257-4070-9ef9-21e7d1f8a883',
    vehicle: 'H3-24 (Martian Moon eXplorer)', field: 'mission_success',
    netUtc: '2026-10-19 19:41:03 UTC', deadlineDays: 21,
  },
];

function buildSpaceMarket(spec: SpaceSpec): Market {
  const netMs = parseUtc(spec.netUtc);
  const onSchedule = spec.field === 'on_schedule_24h';
  // on_schedule_24h can only be judged once the tolerance window has run out,
  // so read at net + tolerance + 1h; a success/failure is visible within hours.
  const resolveAfterMs = onSchedule ? netMs + ON_SCHEDULE_TOLERANCE_SEC * 1000 + HOUR : netMs + 6 * HOUR;
  const closeTimeMs = netMs - 5 * 60_000;
  const resolveDeadlineMs = netMs + spec.deadlineDays * DAY;
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) throw new Error(`${spec.label}: deadline too early`);
  const criteria = onSchedule
    ? `Kind: space\nProvider: ll2\nLaunchId: ${spec.launchId}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\nField: on_schedule_24h\n` +
      `ScheduledNet: ${fmtUtc(netMs)}\nToleranceSec: ${ON_SCHEDULE_TOLERANCE_SEC}\nTieBreak: NO\n`
    : `Kind: space\nProvider: ll2\nLaunchId: ${spec.launchId}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\nField: mission_success\n` +
      `SuccessStatusIds: 3\nTieBreak: NO\n`;
  return {
    label: spec.label,
    category: 'space',
    question: onSchedule
      ? `🚀 Will the ${spec.vehicle} launch lift off within 24h of its scheduled ${spec.netUtc}?`
      : `🚀 Will the ${spec.vehicle} launch (scheduled ${spec.netUtc}) be a success?`,
    description: onSchedule
      ? `Binary outcome on the actual liftoff time of ${spec.vehicle} (Launch Library 2 id ${spec.launchId}) ` +
        `versus the T-0 recorded at market creation (${spec.netUtc}). Resolves YES iff the launch reaches a ` +
        `terminal status (Success, Failure or Partial Failure) and the observed liftoff falls within 24 hours of ` +
        `that T-0; NO if scrubs push it beyond the window. If it has not lifted off by the resolve deadline the ` +
        `market is auto-cancelled and stakes refunded.`
      : `Binary outcome on the launch result of ${spec.vehicle} (Launch Library 2 id ${spec.launchId}, scheduled ` +
        `T-0 ${spec.netUtc}). Resolves YES iff the LL2 status is Success; NO if it is a Failure or Partial ` +
        `Failure. If the launch has not reached a terminal status by the resolve deadline the market is ` +
        `auto-cancelled and stakes refunded.`,
    resolutionSource: `${LL2_BASE}/launch/${spec.launchId}/`,
    resolutionCriteria: criteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

async function verifySpaceSpec(spec: SpaceSpec, launch: LL2Launch): Promise<void> {
  if (launch.id.toLowerCase() !== spec.launchId.toLowerCase()) {
    throw new Error(`launch id mismatch: spec=${spec.launchId} LL2=${launch.id}`);
  }
  const netMs = Date.parse(launch.net ?? '');
  if (!Number.isFinite(netMs)) throw new Error(`LL2 has no parseable net for ${spec.launchId}`);
  if (Math.abs(netMs - parseUtc(spec.netUtc)) > 60_000) {
    throw new Error(`net drift: spec ${spec.netUtc} vs LL2 ${launch.net}`);
  }
  // 1 Go / 2 TBD / 8 TBC are the pre-launch states. Anything else means the
  // launch already flew, was held, or was removed.
  if (![1, 2, 8].includes(launch.status?.id)) {
    throw new Error(`launch is not pre-flight (status ${launch.status?.id} ${launch.status?.abbrev})`);
  }
  await Promise.resolve();
}

interface LL2Launch { id: string; net: string | null; status: { id: number; abbrev: string } }

// ============================================================
// Music (Apple Music RSS)
// ============================================================

interface MusicSpec {
  country: string;
  chart: 'most-played';
  trackId: string;
  trackName: string;
  artistName: string;
  comparisonOp: '==' | '<=';
  threshold: number;
  resolveAfterUtc: string;
}

// Chart positions read on 2026-10-09 (feed updated 03:56 UTC) from
// rss.marketingtools.apple.com .../music/most-played/10/songs.json:
//   kr: 1 CRASH (6813395915), 2 SUN KISS (6795782855)
//   us: 1 Solar Eclipse (6818209989), 6 Patient Zero (6814997425)
// The feed refreshes before 04:00 UTC, so every snapshot is taken at 06:00 UTC.
const MUSIC_SPECS: MusicSpec[] = [
  { country: 'kr', chart: 'most-played', trackId: '6795782855', trackName: 'SUN KISS', artistName: '튜이드', comparisonOp: '<=', threshold: 3, resolveAfterUtc: '2026-10-13 06:00:00 UTC' },
  { country: 'kr', chart: 'most-played', trackId: '6813395915', trackName: 'CRASH', artistName: 'ALLDAY PROJECT', comparisonOp: '==', threshold: 1, resolveAfterUtc: '2026-10-16 06:00:00 UTC' },
  { country: 'us', chart: 'most-played', trackId: '6814997425', trackName: 'Patient Zero', artistName: 'Taylor Swift', comparisonOp: '<=', threshold: 3, resolveAfterUtc: '2026-10-19 06:00:00 UTC' },
  { country: 'us', chart: 'most-played', trackId: '6818209989', trackName: 'Solar Eclipse', artistName: 'Drake & Don Toliver', comparisonOp: '==', threshold: 1, resolveAfterUtc: '2026-10-23 06:00:00 UTC' },
];

const musicLabel = (s: MusicSpec) => `${s.country.toUpperCase()} ${s.trackName} ${s.comparisonOp}${s.threshold}`;

function buildMusicMarket(spec: MusicSpec): Market {
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const closeTimeMs = resolveAfterMs - 5 * 60_000;
  const resolveDeadlineMs = resolveAfterMs + 14 * DAY;
  const target = spec.comparisonOp === '==' ? `at position ${spec.threshold}` : `in the top ${spec.threshold}`;
  const source = `${ITUNES_BASE}/api/v2/${spec.country}/music/${spec.chart}/10/songs.json`;
  return {
    label: musicLabel(spec),
    category: 'music',
    question:
      `🎵 Will "${spec.trackName}" by ${spec.artistName} be ${target} on the Apple Music ` +
      `${spec.country.toUpperCase()} most-played chart at ${spec.resolveAfterUtc}?`,
    description:
      `Binary outcome on the Apple Music ${spec.country.toUpperCase()} ${spec.chart} chart, fetched once at ` +
      `${spec.resolveAfterUtc}. Resolves YES iff track id ${spec.trackId} ("${spec.trackName}" by ` +
      `${spec.artistName}) is ${target} in that snapshot. The feed carries the top 10 only, so a track that has ` +
      `fallen out of the top 10 by then resolves NO.`,
    resolutionSource: source,
    resolutionCriteria:
      `Kind: music\nProvider: itunes_rss\n` +
      `Country: ${spec.country}\nChart: ${spec.chart}\n` +
      `TrackId: ${spec.trackId}\nTrackName: ${spec.trackName}\nArtistName: ${spec.artistName}\n` +
      `ResolveAfter: ${spec.resolveAfterUtc}\nField: position\n` +
      `Comparison: position ${spec.comparisonOp} ${spec.threshold}\nTieBreak: NO\n`,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

async function verifyMusicSpec(spec: MusicSpec, entries: Array<{ id: string; name: string; artistName: string }>): Promise<void> {
  const hit = entries.find((e) => e.id === spec.trackId);
  if (!hit) {
    // Not an error in itself (a track can re-enter), but the name/artist text
    // is onchain-immutable, so refuse to create one we cannot confirm.
    throw new Error(`trackId ${spec.trackId} is not in the current ${spec.country} top 10, cannot confirm title/artist`);
  }
  if (hit.name !== spec.trackName) throw new Error(`track name mismatch: spec='${spec.trackName}' Apple='${hit.name}'`);
  if (hit.artistName !== spec.artistName) throw new Error(`artist mismatch: spec='${spec.artistName}' Apple='${hit.artistName}'`);
  await Promise.resolve();
}

// ============================================================
// Validation
// ============================================================

// Parse every market with the same parsers the keeper will use. `question` and
// the criteria are immutable once on-chain, so a text slip found later means a
// market that sits pending until it is auto-cancelled.
function selfValidate(m: Market): void {
  const kind = detectKind(m.resolutionCriteria);
  switch (kind) {
    case 'ufc': parseUfcCriteria(m.resolutionCriteria); break;
    case 'sports': parseSportsCriteria(m.resolutionCriteria); break;
    case 'weather': parseWeatherCriteria(m.resolutionCriteria); break;
    case 'space': parseSpaceCriteria(m.resolutionCriteria); break;
    case 'music': parseMusicCriteria(m.resolutionCriteria); break;
    case null: {
      const c = parseResolutionCriteria(m.resolutionCriteria);
      if (!c) throw new Error(`${m.label}: criteria not parseable by the keeper`);
      const expected = m.category === 'finance' ? 'stock' : 'crypto';
      if (c.kind !== expected || c.comparison !== '>' || !Number.isFinite(c.threshold)) {
        throw new Error(`${m.label}: criteria parsed as ${c.kind} ${c.comparison} ${c.threshold}`);
      }
      break;
    }
    default:
      throw new Error(`${m.label}: unexpected resolver kind ${kind}`);
  }
  if (!Number.isFinite(m.closeTimeMs) || !Number.isFinite(m.resolveDeadlineMs)) {
    throw new Error(`${m.label}: non-finite close/deadline`);
  }
  if (m.closeTimeMs <= Date.now()) throw new Error(`${m.label}: closeTime is not in the future`);
  if (m.resolveDeadlineMs <= m.closeTimeMs) throw new Error(`${m.label}: deadline <= close`);
}

// ============================================================
// Main
// ============================================================

const CATEGORIES = ['crypto', 'stock', 'ufc', 'sports', 'weather', 'space', 'music'];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const badFlags = args.filter((a) => a !== '--dry-run' && a !== '--verify' && !a.startsWith('--only='));
  if (badFlags.length > 0) {
    // A mistyped resume flag must not silently fall back to the whole batch.
    console.error(`unknown argument(s): ${badFlags.join(' ')} (valid: --dry-run, --verify, --only=<categories/labels>)`);
    process.exit(1);
  }
  const dry = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const now = Date.now();

  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg
    ? new Set(onlyArg.slice('--only='.length).split(',').map((x) => x.trim()).filter(Boolean))
    : null;
  if (only) {
    const known = new Set<string>([
      ...CATEGORIES,
      ...CRYPTO_SPECS.map(cryptoLabel), ...STOCK_SPECS.map(stockLabel),
      ...UFC_SPECS.map(ufcLabel), ...SPORTS_SPECS.map(sportsLabel),
      ...WEATHER_SPECS.map((s) => s.label), ...SPACE_SPECS.map((s) => s.label),
      ...MUSIC_SPECS.map(musicLabel),
    ]);
    const unknown = [...only].filter((t) => !known.has(t));
    if (unknown.length > 0) {
      console.error(`--only names categories/labels that do not exist: ${unknown.join(', ')}`);
      process.exit(1);
    }
  }
  const selected = (category: string, label: string) => !only || only.has(category) || only.has(label);
  const cryptoSel = CRYPTO_SPECS.filter((s) => selected('crypto', cryptoLabel(s)));
  const stockSel = STOCK_SPECS.filter((s) => selected('stock', stockLabel(s)));
  const ufcSel = UFC_SPECS.filter((s) => selected('ufc', ufcLabel(s)));
  const sportsSel = SPORTS_SPECS.filter((s) => selected('sports', sportsLabel(s)));
  const weatherSel = WEATHER_SPECS.filter((s) => selected('weather', s.label));
  const spaceSel = SPACE_SPECS.filter((s) => selected('space', s.label));
  const musicSel = MUSIC_SPECS.filter((s) => selected('music', musicLabel(s)));

  if (verify) {
    const problems: string[] = [];
    const check = async (label: string, fn: () => Promise<void>) => {
      process.stdout.write(`  [${label}] `);
      try { await fn(); console.log('OK'); }
      catch (err) { const msg = err instanceof Error ? err.message : String(err); console.log(`FAIL: ${msg}`); problems.push(`${label}: ${msg}`); }
    };

    if (ufcSel.length > 0) {
      console.log(`Verifying ${ufcSel.length} UFC bout(s) against ESPN...`);
      for (const s of ufcSel) await check(ufcLabel(s), () => verifyUfcSpec(s));
    }
    if (sportsSel.length > 0) {
      // Paced: TheSportsDB's free tier answers 503 to a tight burst, and a
      // whole batch of fixtures then looks like ten drifted identifiers.
      console.log(`Verifying ${sportsSel.length} football fixture(s) against TheSportsDB...`);
      for (const s of sportsSel) {
        await check(sportsLabel(s), () => verifySportsSpec(s));
        await new Promise((r) => setTimeout(r, SPORTSDB_PACING_MS));
      }
    }
    if (weatherSel.length > 0) {
      console.log(`Verifying ${weatherSel.length} weather location(s) against the Open-Meteo archive...`);
      for (const s of weatherSel) await check(s.label, () => verifyWeatherSpec(s));
    }
    if (spaceSel.length > 0) {
      // One LL2 request per distinct launch id: the free-tier quota is small
      // and three markets here share two launches.
      console.log(`Verifying ${spaceSel.length} launch market(s) against Launch Library 2...`);
      const launches = new Map<string, LL2Launch>();
      for (const id of new Set(spaceSel.map((s) => s.launchId))) {
        try { launches.set(id, await getJson<LL2Launch>(`${LL2_BASE}/launch/${id}/`)); }
        catch (err) { problems.push(`LL2 ${id}: ${err instanceof Error ? err.message : String(err)}`); }
      }
      for (const s of spaceSel) {
        const l = launches.get(s.launchId);
        if (!l) { console.log(`  [${s.label}] SKIP (LL2 lookup failed)`); continue; }
        await check(s.label, () => verifySpaceSpec(s, l));
      }
    }
    if (musicSel.length > 0) {
      // One request per (country, chart), not per market.
      console.log(`Verifying ${musicSel.length} music market(s) against Apple Music RSS...`);
      const charts = new Map<string, Array<{ id: string; name: string; artistName: string }>>();
      for (const key of new Set(musicSel.map((s) => `${s.country}/${s.chart}`))) {
        const [country, chart] = key.split('/');
        try {
          const j = await getJson<{ feed?: { results?: Array<{ id: string; name: string; artistName: string }> } }>(
            `${ITUNES_BASE}/api/v2/${country}/music/${chart}/10/songs.json`,
          );
          charts.set(key, j.feed?.results ?? []);
        } catch (err) { problems.push(`iTunes ${key}: ${err instanceof Error ? err.message : String(err)}`); }
      }
      for (const s of musicSel) {
        const entries = charts.get(`${s.country}/${s.chart}`);
        if (!entries) { console.log(`  [${musicLabel(s)}] SKIP (chart fetch failed)`); continue; }
        await check(musicLabel(s), () => verifyMusicSpec(s, entries));
      }
    }
    console.log('');
    if (problems.length > 0) {
      console.error(`Upstream verification failed (${problems.length}):`);
      for (const p of problems) console.error(`  ${p}`);
      console.error('Nothing was created. Fix or drop the affected specs and re-run.');
      process.exit(1);
    }
  }

  const markets: Market[] = [
    ...(await buildCryptoMarkets(now, cryptoSel)),
    ...(await buildStockMarkets(now, stockSel)),
    ...ufcSel.map(buildUfcMarket),
    ...sportsSel.map(buildSportsMarket),
    ...weatherSel.map(buildWeatherMarket),
    ...spaceSel.map(buildSpaceMarket),
    ...musicSel.map(buildMusicMarket),
  ];
  for (const m of markets) selfValidate(m);

  const labels = new Set<string>();
  for (const m of markets) {
    if (labels.has(m.label)) throw new Error(`duplicate label '${m.label}' would make --only ambiguous`);
    labels.add(m.label);
  }

  for (const m of [...markets].sort((a, b) => a.closeTimeMs - b.closeTimeMs)) {
    console.log(`--- ${m.label} [${m.category}] ---`);
    console.log(`  Q: ${m.question}`);
    console.log(`  closeTime: ${fmtUtc(m.closeTimeMs)}`);
    console.log(`  deadline:  ${fmtUtc(m.resolveDeadlineMs)}`);
    console.log(`  criteria:`);
    for (const ln of m.resolutionCriteria.split('\n').filter(Boolean)) console.log(`    ${ln}`);
    console.log('');
  }
  console.log(`Total: ${markets.length} market(s), self-validated against the keeper parsers.`);
  if (dry) { console.log('[DRY RUN]'); return; }
  if (markets.length === 0) { console.error('nothing selected'); process.exit(1); }

  const admin = parseKeypair(requireEnv('PREDICTION_ADMIN_KEY'));
  const adminAddr = admin.toSuiAddress().toLowerCase();
  if (adminAddr === CANON_RESOLVER) { console.error('admin == resolver'); process.exit(1); }
  const client = new SuiClient({ url: RPC_URL });

  const capObj = await client.getObject({ id: CANON_ADMIN_CAP, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== adminAddr) {
    console.error(`AdminCap not owned by the signer (owner ${capOwner})`); process.exit(1);
  }

  console.log(`Creating ${markets.length} market(s) (creator=${adminAddr}, resolver=${CANON_RESOLVER})`);
  const created: { label: string; id: string }[] = [];
  const failed: { label: string; reason: string }[] = [];
  for (const m of markets) {
    process.stdout.write(`  [${m.label}] creating... `);
    try {
      const id = await createMarketOnChain(client, admin, CANON_PACKAGE_ID, CANON_ADMIN_CAP, CANON_RESOLVER, m);
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
  if (failed.length > 0) {
    console.error(`\nFailed ${failed.length}/${markets.length}:`);
    for (const f of failed) console.error(`  ${f.label}: ${f.reason}`);
    console.error(`\nResume only the failures (after checking none of them exist on-chain):`);
    console.error(`  --only="${failed.map((f) => f.label).join(',')}"`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
