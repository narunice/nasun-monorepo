/**
 * Mixed-category prediction-market batch (2026-06-01).
 *
 * Emits markets across five auto-resolvable categories:
 *   crypto   (Binance spot)            -> 3 markets (BTC / ETH / SOL)
 *   stock    (Twelve Data daily close) -> 2 markets (NVDA / AAPL)
 *   space    (Launch Library 2)        -> 1 market  (Starship Flight 13)
 *   weather  (Open-Meteo archive)      -> 1 market  (Seoul rainy days)
 *   ufc      (ESPN MMA core API)       -> 2 markets (Freedom 250 main + co-main)
 *
 * Every criteria block is self-validated against the live keeper parser in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 *
 * External ids / spot prices verified 2026-06-01:
 *   BTC=73719 ETH=2013 SOL=82.2 (Binance spot)
 *   NVDA=211.14 AAPL=312.06 (Twelve Data, 2026-05-29 close)
 *   Starship Flight 13 LaunchId=ac897b9f-44d2-4ff4-8416-1a0a076e98a2 net=2026-06-30 (LL2)
 *   UFC Freedom 250 EventId=600058854 (ESPN), main compId=401863575
 *     Topuria(4350812) vs Gaethje(3022345); co-main compId=401863576
 *     Pereira(4705658) vs Gane(4426000)
 *   Seoul (37.5665,126.9780) Open-Meteo archive returns daily precipitation
 *
 * Thresholds are set just off spot so each line is a genuine toss-up.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY            creator wallet (holds AdminCap)
 *   PREDICTION_RESOLVER_KEY         keeper privkey (derives resolver address)
 *   PREDICTION_PACKAGE_ID           deployed package id
 *   PREDICTION_ADMIN_CAP            optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-mixed-batch-2026-06-01.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseWeatherCriteria } from '../lib/resolvers/weather.js';
import { parseUfcCriteria } from '../lib/resolvers/ufc.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

type Comparator = '>' | '<';

interface CryptoSpec {
  kind: 'crypto';
  label: string;
  symbol: string;          // Binance ticker, e.g. BTCUSDT
  display: string;         // e.g. BTC
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
  closeUtc: string;        // session close instant (keeper rolls to trading day)
}

interface SpaceSpec {
  kind: 'space';
  label: string;
  launchId: string;
  launchName: string;
  scheduledNet: string;    // informational, shown in question
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
  fighterA: string;        // question framed as "Will <A> beat <B>?"
  athleteAId: string;
  fighterB: string;
  athleteBId: string;
  bout: string;            // weight/title context for the question
  closeUtc: string;
  resolveAfterUtc: string;
  deadlineUtc: string;
}

type Spec = CryptoSpec | StockSpec | SpaceSpec | WeatherSpec | UfcSpec;

// ===== batch definition =====
const SPECS: Spec[] = [
  // --- crypto: close 2026-06-15 23:59 UTC; lines just off spot for a toss-up ---
  { kind: 'crypto', label: 'BTC>75k', symbol: 'BTCUSDT', display: 'BTC', threshold: 75000, comparator: '>', closeUtc: '2026-06-15 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>2000', symbol: 'ETHUSDT', display: 'ETH', threshold: 2000, comparator: '>', closeUtc: '2026-06-15 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL>85', symbol: 'SOLUSDT', display: 'SOL', threshold: 85, comparator: '>', closeUtc: '2026-06-15 23:59:00 UTC' },
  // --- stock: NYSE close 2026-06-15 (Mon) 20:00 UTC (EDT) ---
  { kind: 'stock', label: 'NVDA>215', ticker: 'NVDA', currency: 'USD', threshold: 215, comparator: '>', closeUtc: '2026-06-15 20:00:00 UTC' },
  { kind: 'stock', label: 'AAPL>315', ticker: 'AAPL', currency: 'USD', threshold: 315, comparator: '>', closeUtc: '2026-06-15 20:00:00 UTC' },
  // --- space: Starship Flight 13, net 2026-06-30; long deadline absorbs slips ---
  {
    kind: 'space', label: 'Starship F13',
    launchId: 'ac897b9f-44d2-4ff4-8416-1a0a076e98a2',
    launchName: 'Starship Flight 13',
    scheduledNet: '2026-06-30 00:00:00 UTC',
    closeUtc: '2026-06-29 23:59:00 UTC',
    resolveAfterUtc: '2026-07-01 00:00:00 UTC',
    deadlineUtc: '2026-07-31 00:00:00 UTC',
  },
  // --- weather: Seoul, full week 2026-06-08..06-14 (entirely future) ---
  {
    kind: 'weather', label: 'Seoul rain',
    latitude: 37.5665, longitude: 126.9780, locationName: 'Seoul',
    startDate: '2026-06-08', endDate: '2026-06-14',
    field: 'rainy_days_over', aggregation: 'count', threshold: 3,
    closeUtc: '2026-06-08 00:00:00 UTC',
    resolveAfterUtc: '2026-06-15 00:00:00 UTC',
    deadlineUtc: '2026-06-22 00:00:00 UTC',
  },
  // --- ufc: Freedom 250 (White House), main card 2026-06-15 00:00 UTC ---
  {
    kind: 'ufc', label: 'Topuria-Gaethje',
    eventId: '600058854', competitionId: '401863575',
    fighterA: 'Ilia Topuria', athleteAId: '4350812',
    fighterB: 'Justin Gaethje', athleteBId: '3022345',
    bout: 'Lightweight title',
    closeUtc: '2026-06-14 23:55:00 UTC',
    resolveAfterUtc: '2026-06-15 06:00:00 UTC',
    deadlineUtc: '2026-06-22 00:00:00 UTC',
  },
  {
    kind: 'ufc', label: 'Pereira-Gane',
    eventId: '600058854', competitionId: '401863576',
    fighterA: 'Alex Pereira', athleteAId: '4705658',
    fighterB: 'Ciryl Gane', athleteBId: '4426000',
    bout: 'Interim heavyweight title',
    closeUtc: '2026-06-14 23:55:00 UTC',
    resolveAfterUtc: '2026-06-15 06:00:00 UTC',
    deadlineUtc: '2026-06-22 00:00:00 UTC',
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
  category: 'crypto' | 'finance' | 'space' | 'weather' | 'sports';
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
      question: `\u{1F4C8} Will ${spec.ticker} close ${spec.comparator === '>' ? 'above' : 'below'} $${spec.threshold} on its 2026-06-15 session?`,
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
      question: `\u{1F94A} UFC Freedom 250 — Will ${spec.fighterA} beat ${spec.fighterB}?`,
      description:
        `Binary outcome on the ${spec.bout} bout ${spec.fighterA} vs ${spec.fighterB} at UFC Freedom 250 ` +
        `(White House, main card 2026-06-15 00:00 UTC). Resolves YES iff ${spec.fighterA} is the declared winner, ` +
        `NO iff ${spec.fighterB} wins. A No Contest / Draw, or a card postponed past the resolve deadline, auto-cancels the market.`,
      resolutionSource: source, resolutionCriteria: criteria,
      closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
    };
  }
  // weather
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
  return {
    label: spec.label, category: 'weather',
    question: `\u{2601} Will ${spec.locationName} have more than ${spec.threshold} rainy days during ${spec.startDate} to ${spec.endDate}?`,
    description:
      `Binary outcome on daily precipitation at ${spec.locationName} (${spec.latitude}, ${spec.longitude}) ` +
      `over ${spec.startDate}..${spec.endDate}, via the Open-Meteo archive. ` +
      `Resolves YES iff the count of rainy days (precip >= 1mm) is strictly greater than ${spec.threshold}. ` +
      `If the archive is unavailable past the resolve deadline the market auto-cancels.`,
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
  for (const m of markets) {
    process.stdout.write(`  [${m.category}/${m.label}] creating... `);
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
