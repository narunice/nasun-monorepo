/**
 * FIFA World Cup 2026 prediction-market batch creator -- third batch (TheSportsDB).
 *
 * Emits ONE binary market per fixture:
 *   home_win          -> "Will <home> beat <away>?" (draw resolves NO)
 *
 * Covers the still-open GROUP-STAGE fixtures that did NOT yet have a market as
 * of 2026-06-16, scoped to:
 *   - the 8 remaining Round-1 (matchday 1) fixtures whose kickoff is later than
 *     batch 06b covered (06b stopped at 2026-06-15): France/Senegal, Iraq/Norway,
 *     Argentina/Algeria, Austria/Jordan, Portugal/DR Congo, England/Croatia,
 *     Ghana/Panama, Uzbekistan/Colombia.
 *   - all 24 Round-2 (matchday 2) fixtures (2026-06-18 .. 2026-06-24).
 *
 * Deliberately EXCLUDES:
 *   - the 14 Round-1 fixtures already created by batches 06 + 06b.
 *   - Iran vs New Zealand (2391737) + Canada vs Bosnia (2461104): kickoff had
 *     already elapsed at authoring time.
 *   - Round-3 (matchday 3) fixtures: scheduled but held for a later wave.
 *   - Knockout (Round of 32 onward): not yet published by TheSportsDB. The
 *     group-stage matchups are pre-fixed round-robins (verified: all 12 groups
 *     are complete 4-team round-robins) so R1/R2/R3 do NOT depend on results;
 *     the knockout bracket does and is not creatable yet.
 *
 * EventIds, home/away orientation and kickoff UTC verified 2026-06-16 against
 * https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=<id>
 * (league 4429 = FIFA World Cup; season 2026; strTimestamp is UTC). home_win
 * resolves from intHomeScore/intAwayScore, so home/away orientation must match
 * TheSportsDB strHomeTeam/strAwayTeam exactly.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY            creator wallet
 *   PREDICTION_RESOLVER_KEY         keeper privkey (derives resolver address)
 *   PREDICTION_PACKAGE_ID           deployed package id
 *   PREDICTION_ADMIN_CAP            optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-worldcup-batch-2026-06c.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
const LEAGUE = 'FIFA World Cup';

type MarketKind = 'home_win' | 'total_score_over';

interface Fixture {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;          // "YYYY-MM-DD HH:mm:ss UTC"
  /** Which market(s) to emit for this fixture. */
  kinds: MarketKind[];
  /** Over/Under line; required when kinds includes total_score_over. */
  overLine?: number;
}

// 8 remaining Round-1 + 24 Round-2 group-stage fixtures, one home_win market each.
const FIXTURES: Fixture[] = [
  {
    eventId: '2391742',
    homeTeam: 'France',
    awayTeam: 'Senegal',
    kickoffUtc: '2026-06-16 19:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpI
  {
    eventId: '2461107',
    homeTeam: 'Iraq',
    awayTeam: 'Norway',
    kickoffUtc: '2026-06-16 22:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpI
  {
    eventId: '2391740',
    homeTeam: 'Argentina',
    awayTeam: 'Algeria',
    kickoffUtc: '2026-06-17 01:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpJ
  {
    eventId: '2391741',
    homeTeam: 'Austria',
    awayTeam: 'Jordan',
    kickoffUtc: '2026-06-17 04:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpJ
  {
    eventId: '2461108',
    homeTeam: 'Portugal',
    awayTeam: 'DR Congo',
    kickoffUtc: '2026-06-17 17:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpK
  {
    eventId: '2391743',
    homeTeam: 'England',
    awayTeam: 'Croatia',
    kickoffUtc: '2026-06-17 20:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpL
  {
    eventId: '2391744',
    homeTeam: 'Ghana',
    awayTeam: 'Panama',
    kickoffUtc: '2026-06-17 23:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpL
  {
    eventId: '2391745',
    homeTeam: 'Uzbekistan',
    awayTeam: 'Colombia',
    kickoffUtc: '2026-06-18 02:00:00 UTC',
    kinds: ['home_win'],
  },  // R1 grpK
  {
    eventId: '2461109',
    homeTeam: 'Czech Republic',
    awayTeam: 'South Africa',
    kickoffUtc: '2026-06-18 16:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpA
  {
    eventId: '2461110',
    homeTeam: 'Switzerland',
    awayTeam: 'Bosnia-Herzegovina',
    kickoffUtc: '2026-06-18 19:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpB
  {
    eventId: '2391746',
    homeTeam: 'Canada',
    awayTeam: 'Qatar',
    kickoffUtc: '2026-06-18 22:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpB
  {
    eventId: '2391747',
    homeTeam: 'Mexico',
    awayTeam: 'South Korea',
    kickoffUtc: '2026-06-19 01:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpA
  {
    eventId: '2391750',
    homeTeam: 'USA',
    awayTeam: 'Australia',
    kickoffUtc: '2026-06-19 19:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpD
  {
    eventId: '2391749',
    homeTeam: 'Scotland',
    awayTeam: 'Morocco',
    kickoffUtc: '2026-06-19 22:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpC
  {
    eventId: '2391748',
    homeTeam: 'Brazil',
    awayTeam: 'Haiti',
    kickoffUtc: '2026-06-20 00:30:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpC
  {
    eventId: '2461111',
    homeTeam: 'Turkey',
    awayTeam: 'Paraguay',
    kickoffUtc: '2026-06-20 03:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpD
  {
    eventId: '2461112',
    homeTeam: 'Netherlands',
    awayTeam: 'Sweden',
    kickoffUtc: '2026-06-20 17:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpF
  {
    eventId: '2391752',
    homeTeam: 'Germany',
    awayTeam: 'Ivory Coast',
    kickoffUtc: '2026-06-20 20:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpE
  {
    eventId: '2391751',
    homeTeam: 'Ecuador',
    awayTeam: 'Curacao',
    kickoffUtc: '2026-06-21 00:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpE
  {
    eventId: '2391753',
    homeTeam: 'Tunisia',
    awayTeam: 'Japan',
    kickoffUtc: '2026-06-21 04:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpF
  {
    eventId: '2391756',
    homeTeam: 'Spain',
    awayTeam: 'Saudi Arabia',
    kickoffUtc: '2026-06-21 16:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpH
  {
    eventId: '2391754',
    homeTeam: 'Belgium',
    awayTeam: 'Iran',
    kickoffUtc: '2026-06-21 19:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpG
  {
    eventId: '2391757',
    homeTeam: 'Uruguay',
    awayTeam: 'Cape Verde',
    kickoffUtc: '2026-06-21 22:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpH
  {
    eventId: '2391755',
    homeTeam: 'New Zealand',
    awayTeam: 'Egypt',
    kickoffUtc: '2026-06-22 01:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpG
  {
    eventId: '2391758',
    homeTeam: 'Argentina',
    awayTeam: 'Austria',
    kickoffUtc: '2026-06-22 17:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpJ
  {
    eventId: '2461113',
    homeTeam: 'France',
    awayTeam: 'Iraq',
    kickoffUtc: '2026-06-22 21:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpI
  {
    eventId: '2391760',
    homeTeam: 'Norway',
    awayTeam: 'Senegal',
    kickoffUtc: '2026-06-23 00:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpI
  {
    eventId: '2391759',
    homeTeam: 'Jordan',
    awayTeam: 'Algeria',
    kickoffUtc: '2026-06-23 03:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpJ
  {
    eventId: '2391763',
    homeTeam: 'Portugal',
    awayTeam: 'Uzbekistan',
    kickoffUtc: '2026-06-23 17:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpK
  {
    eventId: '2391761',
    homeTeam: 'England',
    awayTeam: 'Ghana',
    kickoffUtc: '2026-06-23 20:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpL
  {
    eventId: '2391762',
    homeTeam: 'Panama',
    awayTeam: 'Croatia',
    kickoffUtc: '2026-06-23 23:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpL
  {
    eventId: '2461114',
    homeTeam: 'Colombia',
    awayTeam: 'DR Congo',
    kickoffUtc: '2026-06-24 02:00:00 UTC',
    kinds: ['home_win'],
  },  // R2 grpK
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

interface Market {
  label: string;
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildMarkets(fx: Fixture): Market[] {
  const kickoffMs = parseUtc(fx.kickoffUtc);
  const resolveAfterMs = kickoffMs + 3 * 60 * 60_000;         // kickoff + 3h
  const closeTimeMs = kickoffMs - 5 * 60_000;                  // 5 min before
  const resolveDeadlineMs = kickoffMs + 7 * 24 * 60 * 60_000;  // 7 days
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) {
    throw new Error('deadline must be >= ResolveAfter + 30min');
  }
  const source = `https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${fx.eventId}`;
  const out: Market[] = [];

  for (const kind of fx.kinds) {
    if (kind === 'home_win') {
      const criteria =
        `Kind: sports\n` +
        `Provider: thesportsdb\n` +
        `EventId: ${fx.eventId}\n` +
        `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
        `Field: home_win\n` +
        `TieBreak: NO\n`;
      out.push({
        label: `${fx.homeTeam} vs ${fx.awayTeam} [home_win]`,
        question: `⚽ ${LEAGUE} - Will ${fx.homeTeam} beat ${fx.awayTeam}?`,
        description:
          `Binary outcome on the full-time score of the ${LEAGUE} group-stage fixture ` +
          `${fx.homeTeam} vs ${fx.awayTeam} (kickoff ${fx.kickoffUtc}). ` +
          `Resolves YES iff ${fx.homeTeam}'s final score is strictly greater than ${fx.awayTeam}'s. ` +
          `A draw resolves NO. If the match is postponed past the resolve deadline the market is auto-cancelled.`,
        resolutionSource: source,
        resolutionCriteria: criteria,
        closeTimeMs,
        resolveDeadlineMs,
      });
    } else {
      const line = fx.overLine;
      if (line === undefined) throw new Error(`overLine required for ${fx.eventId}`);
      const criteria =
        `Kind: sports\n` +
        `Provider: thesportsdb\n` +
        `EventId: ${fx.eventId}\n` +
        `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
        `Field: total_score_over\n` +
        `Threshold: ${line}\n` +
        `TieBreak: NO\n`;
      out.push({
        label: `${fx.homeTeam} vs ${fx.awayTeam} [over ${line}]`,
        question: `⚽ ${LEAGUE} - ${fx.homeTeam} vs ${fx.awayTeam}: over ${line} total goals?`,
        description:
          `Binary outcome on the full-time combined score of the ${LEAGUE} group-stage fixture ` +
          `${fx.homeTeam} vs ${fx.awayTeam} (kickoff ${fx.kickoffUtc}). ` +
          `Resolves YES iff the total goals (${fx.homeTeam} + ${fx.awayTeam}) is strictly greater than ${line}. ` +
          `If the match is postponed past the resolve deadline the market is auto-cancelled.`,
        resolutionSource: source,
        resolutionCriteria: criteria,
        closeTimeMs,
        resolveDeadlineMs,
      });
    }
  }
  return out;
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
  // ONLY_EVENT lets a partial-failure rerun target a single fixture without
  // re-creating the ones that already succeeded (gas-coin version races on the
  // shared admin wallet can drop one mid-batch).
  const onlyEvent = process.env.ONLY_EVENT;
  const fixtures = onlyEvent ? FIXTURES.filter((f) => f.eventId === onlyEvent) : FIXTURES;
  if (fixtures.length === 0) {
    console.error(onlyEvent ? `ONLY_EVENT=${onlyEvent} matched no fixture.` : 'FIXTURES is empty.');
    process.exit(1);
  }
  const markets = fixtures.flatMap(buildMarkets);
  for (const m of markets) {
    console.log(`--- ${m.label} ---`);
    console.log(`  Q: ${m.question}`);
    console.log(`  closeTime: ${fmtUtc(m.closeTimeMs)}`);
    console.log(`  deadline:  ${fmtUtc(m.resolveDeadlineMs)}`);
    console.log(`  criteria:`);
    for (const ln of m.resolutionCriteria.split('\n').filter(Boolean)) console.log(`    ${ln}`);
    console.log('');
  }
  console.log(`Total: ${markets.length} markets across ${fixtures.length} fixtures.`);
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
    process.stdout.write(`  [${m.label}] creating... `);
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
