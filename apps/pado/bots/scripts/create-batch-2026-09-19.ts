/**
 * Prediction-market batch creator, 2026-09-19.
 *
 * Motivation: as of this date the live OPEN market slate had shrunk to 9
 * markets (see prediction-watchdog investigation the same day), most within
 * a day of their own close_time. This batch spans several event types and
 * durations, each backed by a live pre-flight check against the real
 * external source so no market is created for an event that does not exist:
 *
 *   - crypto (BTC, ETH, SOL): live Binance price fetched at run time,
 *     1d / 1w / 1m horizons with a mix of easy, medium and hard thresholds.
 *   - stock (NVDA, AAPL): live Yahoo Finance quote fetched at run time,
 *     1w / 1m horizons (Twelve Data + Yahoo cross-check at resolution, per
 *     prediction-keeper).
 *   - ufc (2 fights): ESPN core API pre-flight verifies eventId/competitionId
 *     /athleteIds/names before creating, same guard as create-ufc-batch.ts.
 *     - Raul Rosas Jr. vs Raoni Barcelos, UFC Fight Night, 2026-09-26.
 *     - Natalia Silva vs Wang Cong, UFC 332, 2026-10-03.
 *   - sports (EPL): TheSportsDB pre-flight verifies eventId/home/away/date
 *     before creating.
 *     - Manchester United vs Tottenham Hotspur, 2026-10-10.
 *
 * Deliberately excluded this batch (see chat log 2026-09-19):
 *   - esports (LCK): lolesports getSchedule shows the 2026 season already
 *     ended (Finals 2026-09-13, pages.newer=null) -- no real upcoming match.
 *   - space (SpaceX): two Falcon 9 Crew-13 markets are already open and
 *     unresolved; the LL2 shared-quota fix landed today leaves little
 *     headroom for a second concurrent launch (see space.ts comments).
 *   - weather: two markets (Tokyo, Seoul) already open.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY   creator wallet key (AdminCap holder; the only secret)
 * Package, AdminCap and resolver are pinned below (do not use --env-file: the
 * checked-out .env can be stale).
 *
 * Usage:
 *   npx tsx scripts/create-batch-2026-09-19.ts --dry-run
 *   PREDICTION_ADMIN_KEY=... npx tsx scripts/create-batch-2026-09-19.ts
 *
 * Resuming: create_market has no dedup and `question` is immutable, so never
 * re-run the whole batch after a partial failure. --only takes a
 * comma-separated list of categories (crypto, stock, ufc, sports) and/or exact
 * market labels; the failure list printed at the end is in that format.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { nextTradingDay, sessionCloseUtc, localDateString } from '../lib/market-holidays.js';
import { createMarketOnChain, type CreateMarketParams } from '../lib/create-market-tx.js';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';
import { parseUfcCriteria } from '../lib/resolvers/ufc.js';
import { detectKind } from '../lib/resolvers/types.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

// Canonical v8 ids (packages/devnet-config/devnet-ids.json). New markets must
// name the live keeper as resolver or it never resolves or expires them.
const CANON_PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const CANON_ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
const CANON_RESOLVER = '0x5cbc8390ae709b0358f304fd76691dda1f03eae514a9592153125c8cff23aeb0';
const ESPN_BASE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

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

type Market = CreateMarketParams;

const cryptoLabel = (s: { symbol: string; hours: number }) => `${s.symbol} ${s.hours / 24}d`;
const stockLabel = (s: { ticker: string; daysFromNow: number }) => `${s.ticker} ${s.daysFromNow}d`;
const ufcLabel = (s: { fighterA: string; fighterB: string }) => `UFC ${s.fighterA} vs ${s.fighterB}`;
const sportsLabel = (s: { homeTeam: string; awayTeam: string }) => `${s.homeTeam} vs ${s.awayTeam}`;

// One fetch per symbol: the same asset is listed at several horizons, and
// pricing them off different ticks would give each a slightly different base.
const priceCache = new Map<string, Promise<number>>();
function cachedPrice(key: string, fetcher: () => Promise<number>): Promise<number> {
  let p = priceCache.get(key);
  if (!p) { p = fetcher(); priceCache.set(key, p); }
  return p;
}

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

// Bias mix per token spans easy / medium / hard (same idea as
// create-crypto-batch-markets.ts) so the lineup is not uniformly bullish.
// BNB/XRP are skipped: a BNB market is already open until 2026-09-22.
const CRYPTO_SPECS: CryptoSpec[] = [
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0, hours: 24, biasPct: 1 },
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0, hours: 24 * 7, biasPct: 5 },
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0, hours: 24 * 30, biasPct: 15 },
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hours: 24, biasPct: -1 },
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hours: 24 * 7, biasPct: 3 },
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hours: 24 * 30, biasPct: 10 },
  { symbol: 'SOL', binanceSymbol: 'SOLUSDT', displayName: 'Solana', decimals: 2, hours: 24 * 7, biasPct: 8 },
  { symbol: 'SOL', binanceSymbol: 'SOLUSDT', displayName: 'Solana', decimals: 2, hours: 24 * 30, biasPct: 20 },
];
const CRYPTO_RESOLVE_BUFFER_MS = 2 * 60 * 60_000;

async function fetchBinancePrice(symbol: string): Promise<number> {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Binance HTTP ${r.status} for ${symbol}`);
  const j = (await r.json()) as { price: string };
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
    const closeTimeMs = now + spec.hours * 60 * 60_000;
    const resolveDeadlineMs = closeTimeMs + CRYPTO_RESOLVE_BUFFER_MS;
    const readingTime = fmtUtc(closeTimeMs);
    const sourceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${spec.binanceSymbol}`;
    const thresholdHuman = threshold.toLocaleString('en-US', { minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals });
    const liveHuman = livePrice.toLocaleString('en-US', { minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals });
    out.push({
      label: cryptoLabel(spec),
      question: `Will ${spec.displayName} (${spec.symbol}/USDT) close above $${thresholdHuman} on Binance at ${readingTime}?`,
      description:
        `Binary spot-price prediction. Resolves YES if the Binance ticker for ${spec.binanceSymbol} ` +
        `reports a price > ${thresholdHuman} USDT at the reading time; NO otherwise. Reference price ` +
        `at market creation: $${liveHuman}. CoinGecko is used as a fallback price source if Binance is unavailable.`,
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
// Stock (live Yahoo Finance quote at run time; Twelve Data primary at
// resolution per prediction-keeper, matching create-finance-markets.ts)
// ============================================================

interface StockSpec {
  ticker: string;
  displayName: string;
  daysFromNow: number;
  biasPct: number;
}

const STOCK_SPECS: StockSpec[] = [
  { ticker: 'NVDA', displayName: 'NVIDIA Corporation', daysFromNow: 7, biasPct: 2 },
  { ticker: 'NVDA', displayName: 'NVIDIA Corporation', daysFromNow: 30, biasPct: 8 },
  { ticker: 'AAPL', displayName: 'Apple Inc.', daysFromNow: 7, biasPct: 1 },
  { ticker: 'AAPL', displayName: 'Apple Inc.', daysFromNow: 30, biasPct: 4 },
];
const STOCK_RESOLVE_BUFFER_MS = 7 * 24 * 60 * 60_000;

async function fetchYahooQuote(ticker: string): Promise<number> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status} for ${ticker}`);
  const j = (await r.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
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
    const targetMs = now + spec.daysFromNow * 24 * 60 * 60_000;
    const tradingDay = nextTradingDay('NYSE', new Date(targetMs));
    const closeTimeMs = sessionCloseUtc('NYSE', tradingDay);
    const resolveDeadlineMs = closeTimeMs + STOCK_RESOLVE_BUFFER_MS;
    const readingTime = fmtUtc(closeTimeMs);
    const sessionDate = localDateString('NYSE', tradingDay);
    const sourceUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(spec.ticker)}&interval=1day`;
    out.push({
      label: stockLabel(spec),
      question: `Will ${spec.displayName} (${spec.ticker}) close above $${threshold} on ${sessionDate}?`,
      description:
        `Daily-close prediction. Resolves YES if the regular-session close of ${spec.ticker} on ${sessionDate} ` +
        `(NYSE) is > ${threshold}; NO otherwise. Price is read from Twelve Data with Yahoo Finance as a ` +
        `cross-source check (5% agreement required). Reference price at market creation: $${livePrice.toFixed(2)}. ` +
        `Pre-market and after-hours prices are not used.`,
      category: 'finance',
      resolutionSource: sourceUrl,
      resolutionCriteria: `Source: ${sourceUrl}\nSymbol: ${spec.ticker}\nCurrency: USD\nReading time: ${readingTime}\nComparison: close > ${threshold}\nTie-breaking: NO`,
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
  fightStartUtc: string;
}

const UFC_SPECS: UfcSpec[] = [
  // Verified live against sports.core.api.espn.com on 2026-09-19: event
  // 600061266 competitions list -> compId 401911630 competitors resolve to
  // athlete 5088844 "Raul Rosas Jr." and 3075570 "Raoni Barcelos". Event date
  // (card start) 2026-09-26T19:00Z from the site scoreboard endpoint.
  {
    eventId: '600061266',
    competitionId: '401911630',
    athleteAId: '5088844',
    athleteBId: '3075570',
    fighterA: 'Raul Rosas Jr.',
    fighterB: 'Raoni Barcelos',
    eventName: 'Fight Night: Rosas Jr. vs. Barcelos',
    fightStartUtc: '2026-09-26 19:00:00 UTC',
  },
  // Verified live: event 600061182 competitions list -> compId 401912278
  // competitors resolve to athlete 4054605 "Natalia Silva" and 4215200
  // "Wang Cong". Card start 2026-10-03T21:00Z.
  {
    eventId: '600061182',
    competitionId: '401912278',
    athleteAId: '4054605',
    athleteBId: '4215200',
    fighterA: 'Natalia Silva',
    fighterB: 'Wang Cong',
    eventName: '332: Silva vs. Wang',
    fightStartUtc: '2026-10-03 21:00:00 UTC',
  },
];

interface EspnCompetitor {
  athleteId: string;
  displayName: string;
}

async function espnFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`espn HTTP ${res.status} on ${url}`);
  return (await res.json()) as T;
}

async function fetchEspnCompetitors(eventId: string, compId: string): Promise<EspnCompetitor[]> {
  const url = `${ESPN_BASE}/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(compId)}`;
  const comp = await espnFetch<{ competitors?: Array<{ athlete?: { $ref?: string } | null }> | null }>(url);
  const out: EspnCompetitor[] = [];
  for (const c of comp.competitors ?? []) {
    const ref = c.athlete?.$ref;
    if (!ref) continue;
    const m = /\/athletes\/(\d+)(?:\?|$)/.exec(ref);
    if (!m) continue;
    const ath = await espnFetch<{ displayName?: string }>(ref);
    out.push({ athleteId: m[1], displayName: ath.displayName ?? '' });
  }
  return out;
}

async function verifyUfcSpec(spec: UfcSpec): Promise<void> {
  const competitors = await fetchEspnCompetitors(spec.eventId, spec.competitionId);
  const a = competitors.find((c) => c.athleteId === spec.athleteAId);
  const b = competitors.find((c) => c.athleteId === spec.athleteBId);
  if (!a) throw new Error(`AthleteAId ${spec.athleteAId} not on ESPN fight ${spec.competitionId}. ESPN has: ${competitors.map((c) => `${c.athleteId} (${c.displayName})`).join(', ')}`);
  if (!b) throw new Error(`AthleteBId ${spec.athleteBId} not on ESPN fight ${spec.competitionId}. ESPN has: ${competitors.map((c) => `${c.athleteId} (${c.displayName})`).join(', ')}`);
  if (a.displayName.toLowerCase() !== spec.fighterA.toLowerCase()) {
    throw new Error(`FighterA name mismatch: spec='${spec.fighterA}' ESPN='${a.displayName}'`);
  }
  if (b.displayName.toLowerCase() !== spec.fighterB.toLowerCase()) {
    throw new Error(`FighterB name mismatch: spec='${spec.fighterB}' ESPN='${b.displayName}'`);
  }

  // closeTime is derived from fightStartUtc, so a rescheduled card or a bout
  // that already started would leave trading open past the fight.
  const ev = await espnFetch<{ date?: string }>(`${ESPN_BASE}/events/${encodeURIComponent(spec.eventId)}`);
  const evMs = Date.parse(ev.date ?? '');
  if (!Number.isFinite(evMs) || Math.abs(evMs - parseUtc(spec.fightStartUtc)) > 60_000) {
    throw new Error(`card start drift: spec ${spec.fightStartUtc} vs ESPN ${ev.date}`);
  }
  const comp = await espnFetch<{ status?: { $ref?: string } | null }>(
    `${ESPN_BASE}/events/${encodeURIComponent(spec.eventId)}/competitions/${encodeURIComponent(spec.competitionId)}`,
  );
  const statusRef = comp.status?.$ref;
  if (!statusRef) throw new Error('competition has no status ref');
  const status = await espnFetch<{ type?: { state?: string } | null }>(statusRef.replace(/^http:/, 'https:'));
  if (status.type?.state !== 'pre') {
    throw new Error(`bout is not pre-fight (state=${status.type?.state})`);
  }
}

function buildUfcMarket(spec: UfcSpec): Market {
  const fightStartMs = parseUtc(spec.fightStartUtc);
  const resolveAfterMs = fightStartMs + 4 * 60 * 60_000;
  const closeTimeMs = fightStartMs - 5 * 60_000;
  const resolveDeadlineMs = fightStartMs + 7 * 24 * 60 * 60_000;
  const resolutionCriteria =
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
    label: ufcLabel(spec),
    question: `🥊 UFC ${spec.eventName}: Will ${spec.fighterA} beat ${spec.fighterB}?`,
    description:
      `Binary outcome on the official ESPN result of the UFC ${spec.eventName} bout ${spec.fighterA} vs ` +
      `${spec.fighterB} (card start ${spec.fightStartUtc}; trading closes 5 minutes before the card starts). ` +
      `Resolves YES iff ${spec.fighterA} is declared ` +
      `the winner. Resolves NO iff ${spec.fighterB} is declared the winner. A No Contest, Draw, or bout ` +
      `cancelled past the resolve deadline results in the market being auto-cancelled (refund).`,
    category: 'sports',
    resolutionSource: `${ESPN_BASE}/events/${spec.eventId}/competitions/${spec.competitionId}`,
    resolutionCriteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

// ============================================================
// Sports / EPL (TheSportsDB, pre-flight verified)
// ============================================================

interface SportsSpec {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffUtc: string;
}

const SPORTS_SPECS: SportsSpec[] = [
  // Verified live against thesportsdb.com eventsround.php?id=4328&r=6&s=2026-2027
  // on 2026-09-19: idEvent 2494050, dateEvent 2026-10-10, strTime 16:30:00,
  // "Manchester United vs Tottenham Hotspur", status NS (not started).
  {
    eventId: '2494050',
    homeTeam: 'Manchester United',
    awayTeam: 'Tottenham Hotspur',
    league: 'Premier League',
    kickoffUtc: '2026-10-10 16:30:00 UTC',
  },
];

async function verifySportsSpec(spec: SportsSpec): Promise<void> {
  const r = await fetch(`${SPORTSDB_BASE}/lookupevent.php?id=${spec.eventId}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`TheSportsDB HTTP ${r.status}`);
  const j = (await r.json()) as { events?: Array<{ strHomeTeam?: string; strAwayTeam?: string; strTimestamp?: string; strStatus?: string }> };
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
  const resolveAfterMs = kickoffMs + 3 * 60 * 60_000;
  const closeTimeMs = kickoffMs - 5 * 60_000;
  const resolveDeadlineMs = kickoffMs + 7 * 24 * 60 * 60_000;
  const resolutionCriteria =
    `Kind: sports\n` +
    `Provider: thesportsdb\n` +
    `EventId: ${spec.eventId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: home_win\n` +
    `TieBreak: NO\n`;
  return {
    label: sportsLabel(spec),
    question: `⚽ ${spec.league} - Will ${spec.homeTeam} beat ${spec.awayTeam}?`,
    description:
      `Binary outcome on the regulation/full-time score of the ${spec.league} fixture ${spec.homeTeam} vs ` +
      `${spec.awayTeam} (kickoff ${spec.kickoffUtc}). Resolves YES iff ${spec.homeTeam}'s final score is ` +
      `strictly greater than ${spec.awayTeam}'s. A draw resolves NO. If the match is postponed past the ` +
      `resolve deadline the market is auto-cancelled.`,
    category: 'sports',
    resolutionSource: `${SPORTSDB_BASE}/lookupevent.php?id=${spec.eventId}`,
    resolutionCriteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

// ============================================================
// Validation
// ============================================================

// Parse every market with the same parsers the keeper will use. `question` and
// the criteria are immutable once on-chain, so a text slip found later means a
// market that sits pending until it is auto-cancelled.
function selfValidate(m: Market): void {
  const kind = detectKind(m.resolutionCriteria);
  if (kind === 'ufc') {
    parseUfcCriteria(m.resolutionCriteria);
  } else if (kind === 'sports') {
    parseSportsCriteria(m.resolutionCriteria);
  } else if (kind === null) {
    const c = parseResolutionCriteria(m.resolutionCriteria);
    if (!c) throw new Error(`${m.label}: criteria not parseable by the keeper`);
    const expected = m.category === 'finance' ? 'stock' : 'crypto';
    if (c.kind !== expected || c.comparison !== '>' || !Number.isFinite(c.threshold)) {
      throw new Error(`${m.label}: criteria parsed as ${c.kind} ${c.comparison} ${c.threshold}`);
    }
  } else {
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

const CATEGORIES = ['crypto', 'stock', 'ufc', 'sports'];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const badFlags = args.filter((a) => a !== '--dry-run' && !a.startsWith('--only='));
  if (badFlags.length > 0) {
    // A mistyped resume flag must not silently fall back to the whole batch.
    console.error(`unknown argument(s): ${badFlags.join(' ')} (valid: --dry-run, --only=<categories/labels>)`);
    process.exit(1);
  }
  const dry = args.includes('--dry-run');
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

  if (ufcSel.length > 0) {
    console.log(`Verifying ${ufcSel.length} UFC fight(s) against ESPN...`);
    for (const spec of ufcSel) {
      process.stdout.write(`  [${ufcLabel(spec)}] `);
      await verifyUfcSpec(spec);
      console.log('OK');
    }
  }
  if (sportsSel.length > 0) {
    console.log(`Verifying ${sportsSel.length} sports fixture(s) against TheSportsDB...`);
    for (const spec of sportsSel) {
      process.stdout.write(`  [${sportsLabel(spec)}] `);
      await verifySportsSpec(spec);
      console.log('OK');
    }
  }
  console.log('');

  const markets: Market[] = [
    ...(await buildCryptoMarkets(now, cryptoSel)),
    ...(await buildStockMarkets(now, stockSel)),
    ...ufcSel.map(buildUfcMarket),
    ...sportsSel.map(buildSportsMarket),
  ];
  for (const m of markets) selfValidate(m);

  for (const m of markets) {
    console.log(`--- ${m.label} ---`);
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
