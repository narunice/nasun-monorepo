/**
 * Prediction-market batch (2026-07-29, devnet v8 "V10-v8reset").
 *
 * Eight auto-resolvable categories, every identifier and price anchor pulled
 * live from the exact upstream the keeper resolves with on 2026-07-29. No
 * fabricated events: every fixture, bout, series, launch and chart track below
 * was read out of its API this session and re-checkable with --verify.
 *   crypto   (Binance spot)                -> 9
 *   stock    (Twelve Data + Yahoo)         -> 7
 *   sports   (TheSportsDB)                 -> 8  (K League / La Liga / EPL / Serie A / Ligue 1)
 *   esports  (lolesports LCK)              -> 5
 *   space    (Launch Library 2, Go only)   -> 4
 *   ufc      (ESPN core)                   -> 6
 *   music    (Apple Music RSS, US)         -> 3
 *   weather  (Open-Meteo archive)          -> 3
 *
 * Horizon buckets are 3d / 7d / 2w / 4w from 2026-07-29. Event-driven markets
 * (sports, esports, ufc, space) are pinned to the real event time, so they land
 * on the nearest bucket rather than exactly on it.
 *
 * Deliberate exclusions (user decision, 2026-07-29):
 *   - Chang'e 7 (LL2 9d402fb6..., net 08-24) is status TBC; a slip past the
 *     resolve deadline would only produce a refund, so it is not worth listing.
 *   - No 4-week weather market: Open-Meteo forecast reaches ~16 days, so an
 *     08-20..24 window cannot be threshold-calibrated at creation time.
 *   - MLS 2406963 (07-31) left out: under 2 days of betting window.
 *
 * Canonical ids pinned from packages/devnet-config/devnet-ids.json
 * ("V10-v8reset"), identical to the 2026-07-19 batch:
 *   package   0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9 (Immutable)
 *   AdminCap  0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac
 *             owned by admin 0x98f5339a... (keystore alias admin-v8)
 *   resolver  0x5cbc8390... (LIVE keeper wallet, distinct from creator)
 * The committed bots/.env is stale, so package/cap/resolver are hardcoded and
 * the signer is loaded in-memory from ~/.sui/sui_config/sui.keystore (AdminCap
 * owner). Override with PREDICTION_ADMIN_KEY_OVERRIDE only if not in keystore.
 *
 * Live anchors captured 2026-07-29 (UTC):
 *   Binance spot:  BTC=63778.01  ETH=1897.11  SOL=73.21  BNB=567.51
 *   Yahoo close:   NVDA=197.01  AAPL=340.08  TSLA=307.44  MSFT=393.35
 *                  005930.KS=202500 KRW
 *   Apple Music us/most-played: #1 6792676860 Been By Now (Morgan Wallen),
 *                  #2 1844932150 Choosin' Texas (Ella Langley),
 *                  #4 6769568596 Janice STFU (Drake)
 *   Open-Meteo forecast (daily Tmax C):
 *                  Seoul  08-03/04/05 = 36.2 / 36.9 / 37.3
 *                  Tokyo  08-08/09/10 = 34.8 / 32.6 / 30.4
 *                  NY     08-10/11/12 = 32.1 / 32.2 / 35.5
 *
 * Every criteria block is self-validated against the real keeper parsers in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 * --verify additionally re-reads every upstream and aborts on identifier drift
 * (renamed fighter, rescheduled fixture, delisted track).
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-07-29.ts --dry-run
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-07-29.ts --dry-run --verify
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-07-29.ts --verify   # live
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
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseMusicCriteria } from '../lib/resolvers/music.js';
import { parseUfcCriteria } from '../lib/resolvers/ufc.js';
import { parseEsportsCriteria } from '../lib/resolvers/esports.js';
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

const ESPN_BASE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const LL2_BASE = 'https://ll.thespacedevs.com/2.2.0';
const LOLESPORTS_BASE = 'https://esports-api.lolesports.com/persisted/gw';
const LOLESPORTS_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const LCK_LEAGUE_ID = '98767991310872058';

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
  field: 'home_win' | 'total_score_over';
  /** total_score_over threshold, e.g. 2.5. Ignored for home_win. */
  totalThreshold?: number;
}

interface EsportsSpec {
  kind: 'esports';
  label: string;
  matchId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  bestOf: 1 | 3 | 5;
  blockName: string;
  matchStartUtc: string;
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
  netUtc: string;           // scheduled T-0 (UTC)
  resolveAfterUtc: string;  // read status after this (net + buffer)
  closeUtc: string;         // betting locks (before net)
  deadlineUtc: string;
}

interface MusicSpec {
  kind: 'music';
  label: string;
  country: string;          // 2-letter lowercase, e.g. 'us'
  chart: 'most-played' | 'top-albums' | 'coming-soon';
  trackId: string;          // numeric Apple id
  trackName: string;
  artistName: string;
  comparator: '==' | '<=';
  threshold: number;        // rank
  resolveAfterUtc: string;  // chart snapshot time
  closeUtc: string;
  deadlineUtc: string;
}

type Spec =
  | CryptoSpec | StockSpec | SportsSpec | EsportsSpec
  | UfcSpec | WeatherSpec | SpaceSpec | MusicSpec;

// ===== batch definition =====
// Bucket close targets: 3d = 08-01, 7d = 08-05, 2w = 08-12, 4w = 08-26.
const SPECS: Spec[] = [
  // --- crypto (Binance spot, anchors in the header) ---
  { kind: 'crypto', label: 'BTC>65k/3d',  symbol: 'BTCUSDT', display: 'BTC', threshold: 65000, comparator: '>', closeUtc: '2026-08-01 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL>75/3d',   symbol: 'SOLUSDT', display: 'SOL', threshold: 75,    comparator: '>', closeUtc: '2026-08-01 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>2000/7d', symbol: 'ETHUSDT', display: 'ETH', threshold: 2000,  comparator: '>', closeUtc: '2026-08-05 23:59:00 UTC' },
  { kind: 'crypto', label: 'BTC<60k/7d',  symbol: 'BTCUSDT', display: 'BTC', threshold: 60000, comparator: '<', closeUtc: '2026-08-05 23:59:00 UTC' },
  { kind: 'crypto', label: 'BTC>70k/2w',  symbol: 'BTCUSDT', display: 'BTC', threshold: 70000, comparator: '>', closeUtc: '2026-08-12 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>2100/2w', symbol: 'ETHUSDT', display: 'ETH', threshold: 2100,  comparator: '>', closeUtc: '2026-08-12 23:59:00 UTC' },
  { kind: 'crypto', label: 'BTC>75k/4w',  symbol: 'BTCUSDT', display: 'BTC', threshold: 75000, comparator: '>', closeUtc: '2026-08-26 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL>90/4w',   symbol: 'SOLUSDT', display: 'SOL', threshold: 90,    comparator: '>', closeUtc: '2026-08-26 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH<1700/4w', symbol: 'ETHUSDT', display: 'ETH', threshold: 1700,  comparator: '<', closeUtc: '2026-08-26 23:59:00 UTC' },

  // --- stock (US -> Twelve Data + Yahoo cross-check; KRX -> Yahoo) ---
  { kind: 'stock', label: 'NVDA>200/3d',  ticker: 'NVDA',      exchange: 'NYSE', currency: 'USD', displayName: 'NVIDIA Corporation',  threshold: 200,    comparator: '>', readingDate: '2026-07-31' },
  { kind: 'stock', label: 'AAPL>350/7d',  ticker: 'AAPL',      exchange: 'NYSE', currency: 'USD', displayName: 'Apple Inc.',          threshold: 350,    comparator: '>', readingDate: '2026-08-05' },
  { kind: 'stock', label: 'SEC>210k/7d',  ticker: '005930.KS', exchange: 'KRX',  currency: 'KRW', displayName: 'Samsung Electronics', threshold: 210000, comparator: '>', readingDate: '2026-08-05' },
  { kind: 'stock', label: 'TSLA>320/2w',  ticker: 'TSLA',      exchange: 'NYSE', currency: 'USD', displayName: 'Tesla, Inc.',         threshold: 320,    comparator: '>', readingDate: '2026-08-12' },
  { kind: 'stock', label: 'MSFT>400/2w',  ticker: 'MSFT',      exchange: 'NYSE', currency: 'USD', displayName: 'Microsoft Corporation', threshold: 400,  comparator: '>', readingDate: '2026-08-12' },
  { kind: 'stock', label: 'NVDA>220/4w',  ticker: 'NVDA',      exchange: 'NYSE', currency: 'USD', displayName: 'NVIDIA Corporation',  threshold: 220,    comparator: '>', readingDate: '2026-08-26' },
  { kind: 'stock', label: 'SEC>230k/4w',  ticker: '005930.KS', exchange: 'KRX',  currency: 'KRW', displayName: 'Samsung Electronics', threshold: 230000, comparator: '>', readingDate: '2026-08-26' },

  // --- sports (TheSportsDB, ids verified via lookupevent.php on 2026-07-29) ---
  { kind: 'sports', label: 'GWN-BCN o2.5', league: 'K League 1',        eventId: '2416501', homeTeam: 'Gangwon FC',            awayTeam: 'Bucheon FC 1995', kickoffUtc: '2026-08-01 10:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'JBH win',      league: 'K League 1',        eventId: '2416511', homeTeam: 'Jeonbuk Hyundai Motors', awayTeam: 'Jeju SK',        kickoffUtc: '2026-08-08 10:30:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'ALA-GET o2.5', league: 'La Liga',           eventId: '2506176', homeTeam: 'Deportivo Alaves',      awayTeam: 'Getafe',          kickoffUtc: '2026-08-15 17:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'ARS win',      league: 'Premier League',    eventId: '2494000', homeTeam: 'Arsenal',               awayTeam: 'Coventry City',   kickoffUtc: '2026-08-21 19:00:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'HUL-MUN o2.5', league: 'Premier League',    eventId: '2494001', homeTeam: 'Hull City',             awayTeam: 'Manchester United', kickoffUtc: '2026-08-22 11:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'UDI-COM o2.5', league: 'Serie A',           eventId: '2482138', homeTeam: 'Udinese',               awayTeam: 'Como',            kickoffUtc: '2026-08-22 16:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },
  { kind: 'sports', label: 'MAR win',      league: 'Ligue 1',           eventId: '2489463', homeTeam: 'Marseille',             awayTeam: 'Strasbourg',      kickoffUtc: '2026-08-21 18:45:00 UTC', field: 'home_win' },
  { kind: 'sports', label: 'JBH-ULS o2.5', league: 'K League 1',        eventId: '2416521', homeTeam: 'Jeonbuk Hyundai Motors', awayTeam: 'Ulsan HD',       kickoffUtc: '2026-08-22 10:30:00 UTC', field: 'total_score_over', totalThreshold: 2.5 },

  // --- esports: LCK regular season, Bo3, series-level home_win ---
  { kind: 'esports', label: 'GEN-DK',  matchId: '115548147900553473', homeTeamCode: 'GEN', awayTeamCode: 'DK',  homeTeamName: 'Gen.G Esports',        awayTeamName: 'Dplus KIA',            bestOf: 3, blockName: 'Week 10', matchStartUtc: '2026-08-01 10:00:00 UTC' },
  { kind: 'esports', label: 'HLE-GEN', matchId: '115548147900553445', homeTeamCode: 'HLE', awayTeamCode: 'GEN', homeTeamName: 'Hanwha Life Esports',  awayTeamName: 'Gen.G Esports',        bestOf: 3, blockName: 'Week 11', matchStartUtc: '2026-08-05 10:00:00 UTC' },
  { kind: 'esports', label: 'KT-DK',   matchId: '115548147900684589', homeTeamCode: 'KT',  awayTeamCode: 'DK',  homeTeamName: 'kt Rolster',           awayTeamName: 'Dplus KIA',            bestOf: 3, blockName: 'Week 12', matchStartUtc: '2026-08-12 10:00:00 UTC' },
  { kind: 'esports', label: 'DK-GEN',  matchId: '115548147900619049', homeTeamCode: 'DK',  awayTeamCode: 'GEN', homeTeamName: 'Dplus KIA',            awayTeamName: 'Gen.G Esports',        bestOf: 3, blockName: 'Week 13', matchStartUtc: '2026-08-22 08:00:00 UTC' },
  { kind: 'esports', label: 'HLE-T1',  matchId: '115548147900553481', homeTeamCode: 'HLE', awayTeamCode: 'T1',  homeTeamName: 'Hanwha Life Esports',  awayTeamName: 'T1',                   bestOf: 3, blockName: 'Week 13', matchStartUtc: '2026-08-23 08:00:00 UTC' },

  // --- ufc: ESPN core, competitor order 1 -> FighterA (verified 2026-07-29) ---
  {
    kind: 'ufc', label: 'Medic-Rodriguez',
    eventId: '600059339', competitionId: '401870843',
    athleteAId: '4685870', athleteBId: '4426312',
    fighterA: 'Uros Medic', fighterB: 'Daniel Rodriguez',
    eventName: 'Fight Night: Medic vs. Rodriguez',
    fightStartUtc: '2026-08-01 17:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Gamrot-Salkilld',
    eventId: '600060621', competitionId: '401886039',
    athleteAId: '3068125', athleteBId: '5157667',
    fighterA: 'Mateusz Gamrot', fighterB: 'Quillan Salkilld',
    eventName: 'Fight Night: Gamrot vs. Salkilld',
    fightStartUtc: '2026-08-08 21:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'UFC330 main',
    eventId: '600059185', competitionId: '401869336',
    athleteAId: '3332412', athleteBId: '4738092',
    fighterA: 'Islam Makhachev', fighterB: 'Ian Machado Garry',
    eventName: '330: Makhachev vs. Machado Garry',
    fightStartUtc: '2026-08-16 01:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'UFC330 comain',
    eventId: '600059185', competitionId: '401878072',
    athleteAId: '4021217', athleteBId: '4089026',
    fighterA: 'Mackenzie Dern', fighterB: 'Gillian Robertson',
    eventName: '330: Makhachev vs. Machado Garry',
    fightStartUtc: '2026-08-16 01:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Hernandez-Rodrigues',
    eventId: '600060493', competitionId: '401881939',
    athleteAId: '4290956', athleteBId: '4690541',
    fighterA: 'Anthony Hernandez', fighterB: 'Gregory Rodrigues',
    eventName: 'Fight Night: Hernandez vs. Rodrigues',
    fightStartUtc: '2026-08-23 00:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Dolidze-deRidder',
    eventId: '600060493', competitionId: '401887539',
    athleteAId: '4411508', athleteBId: '4423880',
    fighterA: 'Roman Dolidze', fighterB: 'Reinier de Ridder',
    eventName: 'Fight Night: Hernandez vs. Rodrigues',
    fightStartUtc: '2026-08-23 00:00:00 UTC',
  },

  // --- space: Launch Library 2, status Go only, mission_success ---
  {
    kind: 'space', label: 'Starlink 17-52',
    launchId: 'e7e55b53-6f69-4c22-9fc5-df00df653a3f', vehicle: 'Falcon 9 (Starlink Group 17-52)',
    netUtc: '2026-07-31 02:00:00 UTC',
    closeUtc: '2026-07-31 01:30:00 UTC', resolveAfterUtc: '2026-07-31 08:00:00 UTC', deadlineUtc: '2026-08-03 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'BlueBird 6-8',
    launchId: '56a85c82-ea71-449b-828c-b583f6f4a18b', vehicle: 'Falcon 9 (BlueBird Block 2 #6-8)',
    netUtc: '2026-08-05 07:42:00 UTC',
    closeUtc: '2026-08-05 07:00:00 UTC', resolveAfterUtc: '2026-08-05 13:00:00 UTC', deadlineUtc: '2026-08-08 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Michibiki 7',
    launchId: 'b89ab080-66c3-4831-85a9-38d85da71d30', vehicle: 'H3-22 (Michibiki 7 / QZS-7)',
    netUtc: '2026-08-06 19:30:00 UTC',
    closeUtc: '2026-08-06 19:00:00 UTC', resolveAfterUtc: '2026-08-07 02:00:00 UTC', deadlineUtc: '2026-08-09 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Starlink 17-49',
    launchId: '6f94dbe4-1318-4ffb-a53d-351bbdcba733', vehicle: 'Falcon 9 (Starlink Group 17-49)',
    netUtc: '2026-08-11 02:00:00 UTC',
    closeUtc: '2026-08-11 01:30:00 UTC', resolveAfterUtc: '2026-08-11 08:00:00 UTC', deadlineUtc: '2026-08-14 00:00:00 UTC',
  },

  // --- music: Apple Music RSS us/most-played snapshot at resolveAfter ---
  {
    kind: 'music', label: 'Wallen #1/3d',
    country: 'us', chart: 'most-played', trackId: '6792676860',
    trackName: 'Been By Now', artistName: 'Morgan Wallen',
    comparator: '==', threshold: 1,
    resolveAfterUtc: '2026-08-01 12:00:00 UTC', closeUtc: '2026-08-01 11:00:00 UTC', deadlineUtc: '2026-08-03 12:00:00 UTC',
  },
  {
    kind: 'music', label: 'Drake top3/7d',
    country: 'us', chart: 'most-played', trackId: '6769568596',
    trackName: 'Janice STFU', artistName: 'Drake',
    comparator: '<=', threshold: 3,
    resolveAfterUtc: '2026-08-05 12:00:00 UTC', closeUtc: '2026-08-05 11:00:00 UTC', deadlineUtc: '2026-08-07 12:00:00 UTC',
  },
  {
    kind: 'music', label: 'Langley top5/4w',
    country: 'us', chart: 'most-played', trackId: '1844932150',
    trackName: "Choosin' Texas", artistName: 'Ella Langley',
    comparator: '<=', threshold: 5,
    resolveAfterUtc: '2026-08-26 12:00:00 UTC', closeUtc: '2026-08-26 11:00:00 UTC', deadlineUtc: '2026-08-28 12:00:00 UTC',
  },

  // --- weather: observation windows inside the 16-day forecast horizon ---
  {
    kind: 'weather', label: 'Seoul>37C',
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-08-03', endDate: '2026-08-05',
    field: 'temperature_max_over', aggregation: 'max', threshold: 37, unit: 'C',
    closeUtc: '2026-08-03 00:00:00 UTC', resolveAfterUtc: '2026-08-09 00:00:00 UTC', deadlineUtc: '2026-08-12 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'Tokyo>35C',
    locationName: 'Tokyo', latitude: 35.6762, longitude: 139.6503,
    startDate: '2026-08-08', endDate: '2026-08-10',
    field: 'temperature_max_over', aggregation: 'max', threshold: 35, unit: 'C',
    closeUtc: '2026-08-08 00:00:00 UTC', resolveAfterUtc: '2026-08-14 00:00:00 UTC', deadlineUtc: '2026-08-17 00:00:00 UTC',
  },
  {
    kind: 'weather', label: 'NYC>34C',
    locationName: 'New York City', latitude: 40.7128, longitude: -74.0060,
    startDate: '2026-08-10', endDate: '2026-08-12',
    field: 'temperature_max_over', aggregation: 'max', threshold: 34, unit: 'C',
    closeUtc: '2026-08-10 00:00:00 UTC', resolveAfterUtc: '2026-08-16 00:00:00 UTC', deadlineUtc: '2026-08-19 00:00:00 UTC',
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
  category: 'crypto' | 'finance' | 'sports' | 'weather' | 'space' | 'music';
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

function buildEsports(spec: EsportsSpec): Market {
  const startMs = parseUtc(spec.matchStartUtc);
  // Bo3 LCK series run ~2-3h; ResolveAfter is informational (the keeper polls
  // regardless) but is set past the worst-case end.
  const durationMs = (spec.bestOf === 5 ? 4 : spec.bestOf === 3 ? 3 : 1) * 60 * 60_000;
  const resolveAfterMs = startMs + durationMs;
  const closeMs = startMs - 5 * 60_000;
  const deadlineMs = startMs + 7 * 24 * 60 * 60_000;
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error('esports deadline too early');
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
    `Field: home_win\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n`;
  return {
    // Category 'sports' so the market lands in the existing Sports tab; the
    // frontend has no esports subcategory yet.
    label: spec.label, category: 'sports',
    question: `LCK ${spec.blockName}: Will ${spec.homeTeamName} beat ${spec.awayTeamName}?`,
    description:
      `Binary outcome on the official lolesports result of the LCK ${spec.blockName} series ` +
      `${spec.homeTeamName} vs ${spec.awayTeamName} (Best of ${spec.bestOf}, scheduled start ` +
      `${spec.matchStartUtc}). Resolves YES iff ${spec.homeTeamName} wins the series; NO iff ` +
      `${spec.awayTeamName} wins. A forfeit, walkover, or series not completed by the resolve ` +
      `deadline results in the market being auto-cancelled (refund).`,
    resolutionSource: `${LOLESPORTS_BASE}/getSchedule?hl=en-US&leagueId=${LCK_LEAGUE_ID}`,
    resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildUfc(spec: UfcSpec): Market {
  const startMs = parseUtc(spec.fightStartUtc);
  // ESPN status lag after a bout is usually minutes, occasionally hours.
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
      `${spec.fighterA} vs ${spec.fighterB} (scheduled start ${spec.fightStartUtc}). ` +
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

function buildSpace(spec: SpaceSpec): Market {
  const closeMs = parseUtc(spec.closeUtc);
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const deadlineMs = parseUtc(spec.deadlineUtc);
  const netMs = parseUtc(spec.netUtc);
  if (resolveAfterMs <= netMs) throw new Error(`${spec.label}: resolveAfter must be after net`);
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error(`${spec.label}: space deadline too early`);
  const source = `${LL2_BASE}/launch/${spec.launchId}/`;
  // Field mission_success: YES iff the launch reaches status Success (id 3).
  const criteria =
    `Kind: space\n` +
    `Provider: ll2\n` +
    `LaunchId: ${spec.launchId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: mission_success\n` +
    `SuccessStatusIds: 3\n` +
    `TieBreak: NO\n`;
  return {
    label: spec.label, category: 'space',
    question: `Will the ${spec.vehicle} launch (scheduled ${spec.netUtc}) be a success?`,
    description:
      `Binary outcome on the launch result of ${spec.vehicle} (Launch Library 2 id ${spec.launchId}, ` +
      `scheduled T-0 ${spec.netUtc}). Resolves YES iff the launch status is Success; NO if it is a ` +
      `Failure or Partial Failure. If the launch has not reached a terminal status by the resolve ` +
      `deadline the market is auto-cancelled and stakes refunded.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildMusic(spec: MusicSpec): Market {
  const closeMs = parseUtc(spec.closeUtc);
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const deadlineMs = parseUtc(spec.deadlineUtc);
  if (resolveAfterMs <= closeMs) throw new Error(`${spec.label}: resolveAfter must be after close`);
  if (deadlineMs < resolveAfterMs + 30 * 60_000) throw new Error(`${spec.label}: music deadline too early`);
  const source = `https://rss.marketingtools.apple.com/api/v2/${spec.country}/music/${spec.chart}/25/songs.json`;
  const criteria =
    `Kind: music\n` +
    `Provider: itunes_rss\n` +
    `Country: ${spec.country}\n` +
    `Chart: ${spec.chart}\n` +
    `TrackId: ${spec.trackId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: position\n` +
    `Comparison: position ${spec.comparator} ${spec.threshold}\n` +
    `TieBreak: NO\n`;
  const rankPhrase = spec.comparator === '=='
    ? `be the #${spec.threshold} most-played song`
    : `be in the top ${spec.threshold} most-played songs`;
  return {
    label: spec.label, category: 'music',
    question: `Will "${spec.trackName}" by ${spec.artistName} ${rankPhrase} on Apple Music (${spec.country.toUpperCase()}) on ${spec.resolveAfterUtc.slice(0, 10)}?`,
    description:
      `Binary outcome on the Apple Music ${spec.country.toUpperCase()} ${spec.chart} chart, read once at ` +
      `${fmtUtc(resolveAfterMs)}. Resolves YES iff "${spec.trackName}" (track id ${spec.trackId}) sits at a ` +
      `chart position ${spec.comparator} ${spec.threshold} in that snapshot; NO otherwise (including if the ` +
      `track is not on the chart). Source: Apple Music RSS.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

function buildMarket(spec: Spec): Market {
  switch (spec.kind) {
    case 'crypto': return buildCrypto(spec);
    case 'stock': return buildStock(spec);
    case 'sports': return buildSports(spec);
    case 'esports': return buildEsports(spec);
    case 'ufc': return buildUfc(spec);
    case 'weather': return buildWeather(spec);
    case 'space': return buildSpace(spec);
    case 'music': return buildMusic(spec);
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
    if (c.field !== spec.field) throw new Error(`${m.label}: sports field ${c.field} != ${spec.field}`);
    if (c.eventId !== spec.eventId) throw new Error(`${m.label}: eventId mismatch`);
    if (spec.field === 'total_score_over' && c.threshold !== spec.totalThreshold) {
      throw new Error(`${m.label}: sports threshold mismatch`);
    }
  } else if (spec.kind === 'esports') {
    const c = parseEsportsCriteria(m.resolutionCriteria);
    if (c.matchId !== spec.matchId) throw new Error(`${m.label}: matchId mismatch`);
    if (c.homeTeamCode !== spec.homeTeamCode.toUpperCase()) throw new Error(`${m.label}: homeTeamCode mismatch`);
    if (c.bestOf !== spec.bestOf) throw new Error(`${m.label}: bestOf mismatch`);
  } else if (spec.kind === 'ufc') {
    const c = parseUfcCriteria(m.resolutionCriteria);
    if (c.competitionId !== spec.competitionId) throw new Error(`${m.label}: competitionId mismatch`);
    if (c.athleteAId !== spec.athleteAId || c.athleteBId !== spec.athleteBId) {
      throw new Error(`${m.label}: athlete id mismatch`);
    }
  } else if (spec.kind === 'space') {
    const c = parseSpaceCriteria(m.resolutionCriteria);
    if (c.field !== 'mission_success') throw new Error(`${m.label}: space field != mission_success`);
    if (c.launchId !== spec.launchId.toLowerCase()) throw new Error(`${m.label}: launchId mismatch`);
  } else if (spec.kind === 'music') {
    const c = parseMusicCriteria(m.resolutionCriteria);
    if (c.trackId !== spec.trackId) throw new Error(`${m.label}: trackId mismatch`);
    if (c.threshold !== spec.threshold || c.comparisonOp !== spec.comparator) throw new Error(`${m.label}: music comparison mismatch`);
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
 * describe the same event. Catches a rescheduled fixture, a renamed fighter, a
 * launch slipping out of the betting window, or a track leaving the chart
 * between research and creation.
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
      if (e.strStatus && !['NS', 'Not Started', ''].includes(e.strStatus)) {
        fail(s.label, `status is ${e.strStatus}, expected NS`, problems);
      }
    } catch (err) {
      fail(s.label, `sports lookup failed: ${String(err)}`, problems);
    }
  }

  const lckSpecs = specs.filter((x): x is EsportsSpec => x.kind === 'esports');
  if (lckSpecs.length > 0) {
    try {
      const d = await getJson(
        `${LOLESPORTS_BASE}/getSchedule?hl=en-US&leagueId=${LCK_LEAGUE_ID}`,
        { 'x-api-key': process.env.LOLESPORTS_API_KEY || LOLESPORTS_API_KEY },
      ) as { data?: { schedule?: { events?: {
        startTime?: string; state?: string;
        match?: { id?: string; strategy?: { count?: number }; teams?: { code?: string }[] };
      }[] } } };
      const events = d.data?.schedule?.events ?? [];
      for (const s of lckSpecs) {
        const ev = events.find((e) => e.match?.id === s.matchId);
        if (!ev) { fail(s.label, `lolesports has no match ${s.matchId}`, problems); continue; }
        const apiMs = Date.parse(ev.startTime ?? '');
        if (Number.isFinite(apiMs) && Math.abs(apiMs - parseUtc(s.matchStartUtc)) > 60_000) {
          fail(s.label, `start drift: spec ${s.matchStartUtc} vs API ${ev.startTime}`, problems);
        }
        const codes = (ev.match?.teams ?? []).map((t) => (t.code ?? '').toUpperCase());
        if (codes[0] !== s.homeTeamCode || codes[1] !== s.awayTeamCode) {
          fail(s.label, `team order drift: API ${codes.join(' vs ')}`, problems);
        }
        if (ev.match?.strategy?.count !== s.bestOf) {
          fail(s.label, `bestOf drift: API ${ev.match?.strategy?.count}`, problems);
        }
        if (ev.state !== 'unstarted') fail(s.label, `state is ${ev.state}, expected unstarted`, problems);
      }
    } catch (err) {
      fail('esports', `lolesports schedule failed: ${String(err)}`, problems);
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
        // Names are display-only; a mismatch is a warning-grade signal that the
        // bout was reshuffled, so surface it as a problem too.
        if (!names[0] || !names[1]) fail(s.label, 'ESPN athlete displayName missing', problems);
      }
    } catch (err) {
      fail(s.label, `ESPN lookup failed: ${String(err)}`, problems);
    }
  }

  for (const s of specs.filter((x): x is SpaceSpec => x.kind === 'space')) {
    try {
      const l = await getJson(`${LL2_BASE}/launch/${s.launchId}/?mode=list`) as
        { net?: string; status?: { abbrev?: string } };
      const apiMs = Date.parse(l.net ?? '');
      if (!Number.isFinite(apiMs)) { fail(s.label, 'LL2 returned no net', problems); continue; }
      if (apiMs <= parseUtc(s.closeUtc)) {
        fail(s.label, `net ${l.net} is at/before close ${s.closeUtc}`, problems);
      }
      if (apiMs >= parseUtc(s.resolveAfterUtc)) {
        fail(s.label, `net ${l.net} slipped past resolveAfter ${s.resolveAfterUtc}`, problems);
      }
      if (l.status?.abbrev !== 'Go') fail(s.label, `status is ${l.status?.abbrev}, expected Go`, problems);
    } catch (err) {
      fail(s.label, `LL2 lookup failed: ${String(err)}`, problems);
    }
  }

  for (const s of specs.filter((x): x is MusicSpec => x.kind === 'music')) {
    try {
      const d = await getJson(
        `https://rss.marketingtools.apple.com/api/v2/${s.country}/music/${s.chart}/25/songs.json`,
      ) as { feed?: { results?: { id?: string; name?: string }[] } };
      const idx = (d.feed?.results ?? []).findIndex((r) => r.id === s.trackId);
      if (idx < 0) fail(s.label, `track ${s.trackId} is not on the current chart`, problems);
      else console.log(`  [verify] ${s.label}: currently #${idx + 1} ("${d.feed?.results?.[idx]?.name}")`);
    } catch (err) {
      fail(s.label, `Apple RSS lookup failed: ${String(err)}`, problems);
    }
  }

  return problems;
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
  const verify = process.argv.includes('--verify');
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
