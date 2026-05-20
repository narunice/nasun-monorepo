/**
 * UFC prediction-market batch creator (ESPN core API).
 *
 * Per spec, emits one binary market per fight:
 *   "🥊 UFC <eventName>: Will <FighterA> beat <FighterB>?" -> fighter_a_wins
 *   resolveDeadline = fight start + 7d, closeTime = fight start - 5min.
 *
 * Specs are configured below; edit before running. eventId/competitionId/
 * athleteIds must come from ESPN core API. Pre-flight verification calls
 * ESPN and aborts if the competition is missing or athleteIds do not match
 * what ESPN has registered for that fight (catches typos before the
 * on-chain market is created).
 *
 * Lookup helpers (no auth):
 *   List upcoming UFC events:
 *     https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard
 *   List competitions on an event:
 *     https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/<eventId>/competitions?limit=15
 *   Fight detail (competitors + winner once final):
 *     https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/<eventId>/competitions/<compId>
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY            creator wallet
 *   PREDICTION_RESOLVER_KEY         keeper privkey (derives resolver address)
 *   PREDICTION_PACKAGE_ID           deployed package id
 *   PREDICTION_ADMIN_CAP            optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-ufc-batch.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
const ESPN_BASE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';

/**
 * Edit this list before each run.
 *
 * - eventId / competitionId: numeric ESPN IDs
 * - athleteAId / athleteBId: numeric ESPN athlete IDs
 *     Verified against ESPN at pre-flight. Order = order of competitors on
 *     the ESPN response (order=1 -> AthleteA, order=2 -> AthleteB).
 *     If you flip A/B intentionally, the question text and outcome flip too.
 * - fighterA / fighterB: display names used in the market question + evidence.
 *     Verified at pre-flight: must match ESPN displayName exactly (case-insensitive).
 * - eventName: shown in the question, e.g. "Fight Night 277" or "UFC 324".
 * - fightStartUtc: when this specific fight is scheduled to start (not the
 *     card start). Used for closeTime/deadline.
 */
interface Spec {
  eventId: string;
  competitionId: string;
  athleteAId: string;
  athleteBId: string;
  fighterA: string;
  fighterB: string;
  eventName: string;
  fightStartUtc: string;        // "YYYY-MM-DD HH:mm:ss UTC"
}

const SPECS: Spec[] = [
  // UFC Fight Night 277 main card (2026-05-30). All 6 main-card fights.
  // FighterA = ESPN order=1 for each competition (consistent convention).
  // Card start time used as fightStartUtc for every fight; non-main bouts
  // happen earlier on the card but closeTime = card start - 5min closes
  // all betting before the first cage walk to avoid inside-info windows.
  // Verified via ESPN sports.core.api.espn.com/.../events/600058517/competitions/<compId>.

  // Main event
  {
    eventId: '600058517',
    competitionId: '401859897',
    athleteAId: '3151289',
    athleteBId: '4189320',
    fighterA: 'Song Yadong',
    fighterB: 'Deiveson Figueiredo',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 11:00:00 UTC',
  },
  // Co-main
  {
    eventId: '600058517',
    competitionId: '401864363',
    athleteAId: '4217395',
    athleteBId: '5212856',
    fighterA: 'Sergei Pavlovich',
    fighterB: 'Tallison Teixeira',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 11:00:00 UTC',
  },
  {
    eventId: '600058517',
    competitionId: '401864362',
    athleteAId: '4845284',
    athleteBId: '3948876',
    fighterA: 'Zhang Mingyang',
    fighterB: 'Alonzo Menifield',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 11:00:00 UTC',
  },
  {
    eventId: '600058517',
    competitionId: '401867461',
    athleteAId: '3132513',
    athleteBId: '3089915',
    fighterA: 'Muslim Salikhov',
    fighterB: 'Jake Matthews',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 11:00:00 UTC',
  },
  {
    eventId: '600058517',
    competitionId: '401864573',
    athleteAId: '3155425',
    athleteBId: '4405109',
    fighterA: 'Alex Perez',
    fighterB: 'Sumudaerji',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 11:00:00 UTC',
  },
  {
    eventId: '600058517',
    competitionId: '401867462',
    athleteAId: '4336757',
    athleteBId: '5144320',
    fighterA: 'Kai Asakura',
    fighterB: 'Cameron Smotherman',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 11:00:00 UTC',
  },
  // Prelim with Korean fighter Yi Sak Lee (이이삭). Prelim card starts at
  // 08:00 UTC (3h before main card). FighterA = Yi Sak Lee so YES = Korean
  // fighter wins, which reads more naturally for the primary audience.
  {
    eventId: '600058517',
    competitionId: '401867171',
    athleteAId: '5341761',
    athleteBId: '4693161',
    fighterA: 'Yi Sak Lee',
    fighterB: 'Luis Felipe Dias',
    eventName: 'Fight Night 277',
    fightStartUtc: '2026-05-30 08:00:00 UTC',
  },
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
// ESPN pre-flight verification
// ============================================================

interface EspnCompetitor {
  order: number;
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
  const comp = await espnFetch<{
    competitors?: Array<{
      order?: number;
      athlete?: { $ref?: string } | null;
    }> | null;
  }>(url);
  const items = comp.competitors ?? [];
  const out: EspnCompetitor[] = [];
  for (const c of items) {
    const ref = c.athlete?.$ref;
    if (!ref) continue;
    const m = /\/athletes\/(\d+)(?:\?|$)/.exec(ref);
    if (!m) continue;
    const athleteId = m[1];
    const ath = await espnFetch<{ displayName?: string }>(ref);
    out.push({ order: c.order ?? 0, athleteId, displayName: ath.displayName ?? '' });
  }
  return out;
}

async function verifySpec(spec: Spec): Promise<void> {
  const competitors = await fetchEspnCompetitors(spec.eventId, spec.competitionId);
  if (competitors.length < 2) {
    throw new Error(`ESPN returned ${competitors.length} competitors for compId=${spec.competitionId}`);
  }
  const ids = new Set(competitors.map((c) => c.athleteId));
  if (!ids.has(spec.athleteAId)) {
    throw new Error(
      `AthleteAId ${spec.athleteAId} not on ESPN fight. ESPN has: ` +
      competitors.map((c) => `${c.athleteId} (${c.displayName})`).join(', '),
    );
  }
  if (!ids.has(spec.athleteBId)) {
    throw new Error(
      `AthleteBId ${spec.athleteBId} not on ESPN fight. ESPN has: ` +
      competitors.map((c) => `${c.athleteId} (${c.displayName})`).join(', '),
    );
  }
  const a = competitors.find((c) => c.athleteId === spec.athleteAId)!;
  const b = competitors.find((c) => c.athleteId === spec.athleteBId)!;
  // Case-insensitive name match. ESPN sometimes returns slight punctuation
  // variants ("O'Malley" vs "OMalley"); we don't enforce strict equality.
  if (a.displayName.toLowerCase() !== spec.fighterA.toLowerCase()) {
    throw new Error(`FighterA name mismatch: spec='${spec.fighterA}' ESPN='${a.displayName}' (athleteId=${spec.athleteAId})`);
  }
  if (b.displayName.toLowerCase() !== spec.fighterB.toLowerCase()) {
    throw new Error(`FighterB name mismatch: spec='${spec.fighterB}' ESPN='${b.displayName}' (athleteId=${spec.athleteBId})`);
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
  const fightStartMs = parseUtc(spec.fightStartUtc);
  // UFC fights end within ~1h (max 25min for 5-round main event + entrances).
  // ESPN status lag is usually minutes but occasionally hours. 4h buffer is
  // safe; resolver stays pending until state=post regardless.
  const resolveAfterMs = fightStartMs + 4 * 60 * 60_000;
  const closeTimeMs = fightStartMs - 5 * 60_000;
  const resolveDeadlineMs = fightStartMs + 7 * 24 * 60 * 60_000;
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) {
    throw new Error('deadline must be >= ResolveAfter + 30min');
  }
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
    spec,
    // 🥊 + event prefix makes the discipline + card legible at a glance.
    question: `🥊 UFC ${spec.eventName}: Will ${spec.fighterA} beat ${spec.fighterB}?`,
    description:
      `Binary outcome on the official ESPN result of the UFC ${spec.eventName} bout ` +
      `${spec.fighterA} vs ${spec.fighterB} (scheduled start ${spec.fightStartUtc}). ` +
      `Resolves YES iff ${spec.fighterA} is declared the winner. Resolves NO iff ${spec.fighterB} ` +
      `is declared the winner. A No Contest, Draw, or bout cancelled past the resolve ` +
      `deadline results in the market being auto-cancelled (refund).`,
    resolutionSource: `${ESPN_BASE}/events/${spec.eventId}/competitions/${spec.competitionId}`,
    resolutionCriteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

async function createOnChain(
  client: SuiClient, admin: Ed25519Keypair, packageId: string, cap: string,
  resolver: string, m: Market,
): Promise<string> {
  // Admin wallet is shared with price-updater bot which bumps gas-coin versions
  // every minute. Retry on stale-version aborts.
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
          tx.pure.string('ufc'),
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
    console.error('SPECS is empty. Edit create-ufc-batch.ts to add fights.');
    process.exit(1);
  }

  // Pre-flight: verify every spec against ESPN before doing anything on-chain.
  console.log(`Verifying ${SPECS.length} fight(s) against ESPN...`);
  for (const spec of SPECS) {
    process.stdout.write(`  [${spec.fighterA} vs ${spec.fighterB}] `);
    try {
      await verifySpec(spec);
      console.log('OK');
    } catch (err) {
      console.log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
  console.log('');

  const markets = SPECS.map(buildMarket);
  for (const m of markets) {
    console.log(`--- UFC ${m.spec.eventName}: ${m.spec.fighterA} vs ${m.spec.fighterB} ---`);
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

  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== adminAddr) {
    console.error(`AdminCap not owned by admin (${capOwner})`); process.exit(1);
  }

  console.log(`Creating ${markets.length} market(s) (resolver=${resolver} derived)`);
  for (const m of markets) {
    process.stdout.write(`  [${m.spec.fighterA} vs ${m.spec.fighterB}] creating... `);
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
