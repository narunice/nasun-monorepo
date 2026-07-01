/**
 * Full-category prediction-market batch (2026-06-06).
 *
 * Emits markets across ALL eight auto-resolvable categories so every
 * keeper resolver path is exercised:
 *   crypto   (Binance spot)            -> 3 (BTC / ETH / SOL)
 *   stock    (Twelve Data daily close) -> 3 (NVDA / AAPL / TSLA)
 *   space    (Launch Library 2)        -> 2 (H3-30 test flight / Falcon 9)
 *   weather  (Open-Meteo archive)      -> 2 (Seoul monsoon rain / heat)
 *   sports   (TheSportsDB)             -> 3 (FIFA World Cup 2026 group games)
 *   ufc      (ESPN MMA core API)       -> 1 (Fight Night main-card bout)
 *   esports  (lolesports getSchedule)  -> 1 (LCK Knockouts: HLE vs T1)
 *   music    (Apple Music RSS)         -> 2 (US #1 / KR #1 hold)
 *
 * Every criteria block is self-validated against the live keeper parser in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 *
 * Live data verified 2026-06-06 ~01:20 UTC:
 *   Binance spot: BTC=61159 ETH=1585 SOL=64.29
 *   Twelve Data:  NVDA=205.1 AAPL=307.4 TSLA=390.97
 *   LL2:  H3-30 Test Flight id e1a3b702-464f-435d-8c1f-ade9be196b77 net 2026-06-10 00:53Z
 *         Falcon 9 Starlink 17-44 id c7b7e18f-1b42-467e-a8ed-181fb58080e8 net 2026-06-10 14:00Z
 *   TheSportsDB (status NS, verified upcoming):
 *         2391728 Mexico vs South Africa 2026-06-11 19:00Z
 *         2461103 South Korea vs Czech Republic 2026-06-12 02:00Z
 *         2391729 USA vs Paraguay 2026-06-13 01:00Z
 *   ESPN UFC Fight Night (event 600058949, 2026-06-06 21:00Z), competition
 *         401870073: Ketlen Souza(4566308) vs Ariane Carnelossi(4565903),
 *         Women's Strawweight.
 *   lolesports LCK Knockouts matchId 115548128963037575 HLE vs T1 Bo5
 *         start 2026-06-12 08:00Z.
 *   Apple Music most-played #1: US trackId 6769568596 "Janice STFU" (Drake);
 *         KR trackId 1887671067 "REDRED" (CORTIS).
 *
 * Crypto/stock thresholds are pinned just off spot for genuine toss-ups.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY            creator wallet (holds AdminCap)
 *   PREDICTION_RESOLVER_KEY         keeper privkey (derives resolver address)
 *   PREDICTION_PACKAGE_ID           deployed package id (v5)
 *   PREDICTION_ADMIN_CAP            optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-full-batch-2026-06-06.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseWeatherCriteria } from '../lib/resolvers/weather.js';
import { parseUfcCriteria } from '../lib/resolvers/ufc.js';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';
import { parseEsportsCriteria } from '../lib/resolvers/esports.js';
import { parseMusicCriteria } from '../lib/resolvers/music.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
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

interface UfcSpec {
  kind: 'ufc';
  label: string;
  eventId: string;
  competitionId: string;
  fighterA: string;
  athleteAId: string;
  fighterB: string;
  athleteBId: string;
  bout: string;
  eventName: string;
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

interface EsportsSpec {
  kind: 'esports';
  label: string;
  matchId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  blockName: string;
  bestOf: 1 | 3 | 5;
  matchStartUtc: string;
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
  | CryptoSpec | StockSpec | SpaceSpec | WeatherSpec
  | UfcSpec | SportsSpec | EsportsSpec | MusicSpec;

// ===== batch definition =====
const SPECS: Spec[] = [
  // --- crypto: close 2026-06-20 23:59 UTC; lines just off spot ---
  { kind: 'crypto', label: 'BTC>62k', symbol: 'BTCUSDT', display: 'BTC', threshold: 62000, comparator: '>', closeUtc: '2026-06-20 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>1600', symbol: 'ETHUSDT', display: 'ETH', threshold: 1600, comparator: '>', closeUtc: '2026-06-20 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL<62',  symbol: 'SOLUSDT', display: 'SOL', threshold: 62,    comparator: '<', closeUtc: '2026-06-15 23:59:00 UTC' },
  // --- stock: NYSE close 2026-06-19 (Fri) 20:00 UTC (EDT) ---
  { kind: 'stock', label: 'NVDA>205', ticker: 'NVDA', currency: 'USD', threshold: 205, comparator: '>', closeUtc: '2026-06-19 20:00:00 UTC' },
  { kind: 'stock', label: 'AAPL>308', ticker: 'AAPL', currency: 'USD', threshold: 308, comparator: '>', closeUtc: '2026-06-19 20:00:00 UTC' },
  { kind: 'stock', label: 'TSLA>390', ticker: 'TSLA', currency: 'USD', threshold: 390, comparator: '>', closeUtc: '2026-06-19 20:00:00 UTC' },
  // --- space ---
  {
    kind: 'space', label: 'H3-30 test',
    launchId: 'e1a3b702-464f-435d-8c1f-ade9be196b77',
    launchName: 'H3-30 Test Flight',
    scheduledNet: '2026-06-10 00:53:00 UTC',
    closeUtc: '2026-06-09 23:00:00 UTC',
    resolveAfterUtc: '2026-06-10 06:00:00 UTC',
    deadlineUtc: '2026-06-17 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Falcon9 17-44',
    launchId: 'c7b7e18f-1b42-467e-a8ed-181fb58080e8',
    launchName: 'Falcon 9 Starlink Group 17-44',
    scheduledNet: '2026-06-10 14:00:00 UTC',
    closeUtc: '2026-06-10 13:00:00 UTC',
    resolveAfterUtc: '2026-06-10 18:00:00 UTC',
    deadlineUtc: '2026-06-17 00:00:00 UTC',
  },
  // --- weather: Seoul monsoon window (entirely future) ---
  {
    kind: 'weather', label: 'Seoul rain',
    latitude: 37.5665, longitude: 126.9780, locationName: 'Seoul',
    startDate: '2026-06-16', endDate: '2026-06-22',
    field: 'rainy_days_over', aggregation: 'count', threshold: 4,
    closeUtc: '2026-06-16 00:00:00 UTC',
    resolveAfterUtc: '2026-06-23 00:00:00 UTC',
    deadlineUtc: '2026-06-30 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Seoul heat',
    latitude: 37.5665, longitude: 126.9780, locationName: 'Seoul',
    startDate: '2026-06-15', endDate: '2026-06-21',
    field: 'temperature_max_over', aggregation: 'max', threshold: 32,
    closeUtc: '2026-06-15 00:00:00 UTC',
    resolveAfterUtc: '2026-06-22 00:00:00 UTC',
    deadlineUtc: '2026-06-29 00:00:00 UTC',
  },
  // --- sports: FIFA World Cup 2026 group stage ---
  { kind: 'sports', label: 'MEX-RSA', league: 'FIFA World Cup', eventId: '2391728', homeTeam: 'Mexico', awayTeam: 'South Africa', kickoffUtc: '2026-06-11 19:00:00 UTC' },
  { kind: 'sports', label: 'KOR-CZE', league: 'FIFA World Cup', eventId: '2461103', homeTeam: 'South Korea', awayTeam: 'Czech Republic', kickoffUtc: '2026-06-12 02:00:00 UTC' },
  { kind: 'sports', label: 'USA-PAR', league: 'FIFA World Cup', eventId: '2391729', homeTeam: 'USA', awayTeam: 'Paraguay', kickoffUtc: '2026-06-13 01:00:00 UTC' },
  // --- ufc: Fight Night main-card bout (resolves same night) ---
  {
    kind: 'ufc', label: 'Souza-Carnelossi',
    eventId: '600058949', competitionId: '401870073',
    fighterA: 'Ketlen Souza', athleteAId: '4566308',
    fighterB: 'Ariane Carnelossi', athleteBId: '4565903',
    bout: "Women's Strawweight",
    eventName: 'UFC Fight Night: Muhammad vs. Bonfim',
    closeUtc: '2026-06-06 20:55:00 UTC',
    resolveAfterUtc: '2026-06-07 04:00:00 UTC',
    deadlineUtc: '2026-06-14 00:00:00 UTC',
  },
  // --- esports: LCK Knockouts (Bo5) ---
  {
    kind: 'esports', label: 'HLE-T1',
    matchId: '115548128963037575',
    homeTeamCode: 'HLE', awayTeamCode: 'T1',
    homeTeamName: 'Hanwha Life Esports', awayTeamName: 'T1',
    blockName: 'Knockouts', bestOf: 5,
    matchStartUtc: '2026-06-12 08:00:00 UTC',
  },
  // --- music: hold #1 on most-played ---
  {
    kind: 'music', label: 'US #1 Drake',
    country: 'us', chart: 'most-played',
    trackId: '6769568596', trackName: 'Janice STFU', artistName: 'Drake',
    comparisonOp: '==', threshold: 1,
    resolveAfterUtc: '2026-06-13 18:00:00 UTC',
  },
  {
    kind: 'music', label: 'KR #1 CORTIS',
    country: 'kr', chart: 'most-played',
    trackId: '1887671067', trackName: 'REDRED', artistName: 'CORTIS',
    comparisonOp: '==', threshold: 1,
    resolveAfterUtc: '2026-06-13 18:00:00 UTC',
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

function requireEnv(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`${n} required`); process.exit(1); }
  return v;
}

function requireHex64(n: string, v: string): string {
  if (!HEX_64.test(v)) { console.error(`${n} must be 0x-32-byte hex`); process.exit(1); }
  return v.toLowerCase();
}

interface Market {
  label: string;
  category: 'crypto' | 'finance' | 'space' | 'weather' | 'sports' | 'esports' | 'music';
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
      question: `\u{1F4C8} Will ${spec.ticker} close ${spec.comparator === '>' ? 'above' : 'below'} $${spec.threshold} on its 2026-06-19 session?`,
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
  if (spec.kind === 'ufc') {
    const closeMs = parseUtc(spec.closeUtc);
    const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
    const deadlineMs = parseUtc(spec.deadlineUtc);
    if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('ufc deadline too early');
    const source =
      `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${spec.eventId}` +
      `/competitions/${spec.competitionId}/competitors`;
    const criteria =
      `Kind: ufc\n` +
      `Provider: espn\n` +
      `EventId: ${spec.eventId}\n` +
      `CompetitionId: ${spec.competitionId}\n` +
      `AthleteAId: ${spec.athleteAId}\n` +
      `AthleteBId: ${spec.athleteBId}\n` +
      `FighterA: ${spec.fighterA}\n` +
      `FighterB: ${spec.fighterB}\n` +
      `ResolveAfter: ${spec.resolveAfterUtc}\n` +
      `Field: fighter_a_wins\n` +
      `TieBreak: NO\n`;
    return {
      label: spec.label, category: 'sports',
      question: `\u{1F94A} ${spec.eventName} — Will ${spec.fighterA} beat ${spec.fighterB}?`,
      description:
        `Binary outcome on the ${spec.bout} bout ${spec.fighterA} vs ${spec.fighterB} at ${spec.eventName} ` +
        `(${spec.closeUtc.slice(0, 10)}). Resolves YES iff ${spec.fighterA} is the declared winner, ` +
        `NO iff ${spec.fighterB} wins. A No Contest / Draw, or a card postponed past the resolve deadline, auto-cancels the market.`,
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
      question: `\u{26BD} ${spec.league} — Will ${spec.homeTeam} beat ${spec.awayTeam}?`,
      description:
        `Binary outcome on the full-time score of the ${spec.league} fixture ` +
        `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
        `Resolves YES iff ${spec.homeTeam}'s final score is strictly greater than ${spec.awayTeam}'s. ` +
        `A draw resolves NO. If the match is postponed past the resolve deadline the market is auto-cancelled.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  if (spec.kind === 'esports') {
    const startMs = parseUtc(spec.matchStartUtc);
    const resolveAfterMs = startMs + 6 * 60 * 60_000;   // Bo5 can run long
    const closeMs = startMs - 5 * 60_000;
    const deadlineMs = startMs + 7 * 24 * 60 * 60_000;
    if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('esports deadline too early');
    const source =
      `https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US (matchId ${spec.matchId})`;
    const criteria =
      `Kind: esports\n` +
      `Provider: lolesports\n` +
      `League: LCK\n` +
      `MatchId: ${spec.matchId}\n` +
      `HomeTeamCode: ${spec.homeTeamCode}\n` +
      `AwayTeamCode: ${spec.awayTeamCode}\n` +
      `HomeTeamName: ${spec.homeTeamName}\n` +
      `AwayTeamName: ${spec.awayTeamName}\n` +
      `BestOf: ${spec.bestOf}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
      `Field: home_win\n`;
    return {
      label: spec.label, category: 'esports',
      question: `\u{1F3AE} LCK ${spec.blockName}: Will ${spec.homeTeamName} beat ${spec.awayTeamName}?`,
      description:
        `Binary series-level outcome on the LCK ${spec.blockName} best-of-${spec.bestOf} ` +
        `${spec.homeTeamName} (${spec.homeTeamCode}) vs ${spec.awayTeamName} (${spec.awayTeamCode}), ` +
        `start ${spec.matchStartUtc}. Resolves YES iff ${spec.homeTeamName} win the series, NO iff ${spec.awayTeamName} win. ` +
        `A forfeit/walkover or a series postponed past the resolve deadline auto-cancels the market.`,
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
    `Kind: music\n` +
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
  } else if (spec.kind === 'ufc') {
    parseUfcCriteria(m.resolutionCriteria);
  } else if (spec.kind === 'sports') {
    parseSportsCriteria(m.resolutionCriteria);
  } else if (spec.kind === 'esports') {
    parseEsportsCriteria(m.resolutionCriteria);
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

  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== adminAddr) {
    console.error(`AdminCap not owned by admin (${capOwner})`); process.exit(1);
  }

  console.log(`Creating ${markets.length} markets (resolver=${resolver} derived)`);
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
