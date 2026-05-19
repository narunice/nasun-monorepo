/**
 * Sports prediction-market batch creator (TheSportsDB).
 *
 * Per spec, emits one binary market:
 *   "Will <home> beat <away>?" -> home_win, deadline = kickoff + 7d.
 *
 * Specs are configured below; edit before running. eventId must come from
 * TheSportsDB and refer to a future fixture. Free tier key=3 is used.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY            creator wallet
 *   PREDICTION_RESOLVER_KEY         keeper privkey (derives resolver address)
 *   PREDICTION_PACKAGE_ID           deployed package id
 *   PREDICTION_ADMIN_CAP            optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-sports-batch.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Edit this list before each run. Lookup eventId via:
 *   https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=<id>
 * or list upcoming via league:
 *   https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=<leagueId>
 */
interface Spec {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffUtc: string;         // "YYYY-MM-DD HH:mm:ss UTC"
}

const SPECS: Spec[] = [
  // 2026-05-19 reissue: original markets (eventId 2267447 / 2267448 / 2470477)
  // shipped with `Will <home> beat <away>?` questions that omitted sport +
  // league context — viewers couldn't tell soccer from another team-sports
  // discipline at a glance. Same TheSportsDB EventIds, but question now
  // carries the ⚽ + league prefix; original three are admin-cancelled in a
  // follow-up sweep so the new ones are the canonical entries.
  {
    eventId: '2267447',
    homeTeam: 'Liverpool',
    awayTeam: 'Brentford',
    league: 'Premier League',
    kickoffUtc: '2026-05-24 15:00:00 UTC',
  },
  {
    eventId: '2267448',
    homeTeam: 'Manchester City',
    awayTeam: 'Aston Villa',
    league: 'Premier League',
    kickoffUtc: '2026-05-24 15:00:00 UTC',
  },
  {
    eventId: '2470477',
    homeTeam: 'Paris Saint-Germain',
    awayTeam: 'Arsenal',
    league: 'Champions League',
    kickoffUtc: '2026-05-30 16:00:00 UTC',
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
  const kickoffMs = parseUtc(spec.kickoffUtc);
  const resolveAfterMs = kickoffMs + 3 * 60 * 60_000;        // kickoff + 3h
  const closeTimeMs = kickoffMs - 5 * 60_000;                 // 5 min before
  const resolveDeadlineMs = kickoffMs + 7 * 24 * 60 * 60_000; // 7 days
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) {
    throw new Error('deadline must be >= ResolveAfter + 30min');
  }
  const resolutionCriteria =
    `Kind: sports\n` +
    `Provider: thesportsdb\n` +
    `EventId: ${spec.eventId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: home_win\n` +
    `TieBreak: NO\n`;
  return {
    spec,
    // ⚽ + league prefix makes the discipline + competition legible at a
    // glance on the market list. MAX_QUESTION_LEN=500, so even the longest
    // current EPL fixture (~65 bytes) is well within budget.
    question: `⚽ ${spec.league} — Will ${spec.homeTeam} beat ${spec.awayTeam}?`,
    description:
      `Binary outcome on the regulation/full-time score of the ${spec.league} fixture ` +
      `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
      `Resolves YES iff ${spec.homeTeam}'s final score is strictly greater than ${spec.awayTeam}'s. ` +
      `A draw resolves NO. If the match is postponed past the resolve deadline the market is auto-cancelled.`,
    resolutionSource: `https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${spec.eventId}`,
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
  if (SPECS.length === 0) {
    console.error('SPECS is empty. Edit create-sports-batch.ts to add fixtures.');
    process.exit(1);
  }
  const markets = SPECS.map(buildMarket);
  for (const m of markets) {
    console.log(`--- ${m.spec.league}: ${m.spec.homeTeam} vs ${m.spec.awayTeam} ---`);
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

  console.log(`Creating ${markets.length} markets (resolver=${resolver} derived)`);
  for (const m of markets) {
    process.stdout.write(`  [${m.spec.homeTeam} vs ${m.spec.awayTeam}] creating... `);
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
