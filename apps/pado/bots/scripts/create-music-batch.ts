/**
 * Music prediction-market batch creator (Apple Music iTunes RSS).
 *
 * Emits one binary market per Spec:
 *
 *   Comparison: position == 1   -> "Will <track> be #1 in <country> top-songs?"
 *   Comparison: position <= 10  -> "Will <track> stay in top-10?"
 *
 * Track IDs come from the chart endpoint:
 *   https://rss.marketingtools.apple.com/api/v2/<country>/music/most-played/10/songs.json
 * Each entry has numeric `id` (string), `name`, `artistName`. Pin those IDs
 * in SPECS before running.
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-music-batch.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 8000 } }));

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

interface Spec {
  country: string;           // 'kr', 'us', 'jp', 'gb', ...
  chart: 'most-played';
  trackId: string;           // 10-digit Apple Music id (string)
  trackName: string;
  artistName: string;
  resolveAfterUtc: string;   // "YYYY-MM-DD HH:mm:ss UTC", snapshot moment
  comparisonOp: '==' | '<=';
  threshold: number;         // 1 for #1, 10 for top-10
  label: string;
}

const SPECS: Spec[] = [
  {
    country: 'us', chart: 'most-played',
    trackId: '6769568596', trackName: 'Janice STFU', artistName: 'Drake',
    resolveAfterUtc: '2026-05-25 18:00:00 UTC',
    comparisonOp: '==', threshold: 1,
    label: 'Drake Janice STFU #1 US @ 2026-05-25 18:00 UTC',
  },
  {
    country: 'gb', chart: 'most-played',
    trackId: '6769568456', trackName: 'Make Them Cry', artistName: 'Drake',
    resolveAfterUtc: '2026-05-25 18:00:00 UTC',
    comparisonOp: '==', threshold: 1,
    label: 'Drake Make Them Cry #1 UK @ 2026-05-25 18:00 UTC',
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
  const resolveAfterMs = parseUtc(spec.resolveAfterUtc);
  const closeTimeMs = resolveAfterMs - 5 * 60_000;        // close 5 min before snapshot
  const resolveDeadlineMs = resolveAfterMs + 14 * 24 * 60 * 60_000;
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) {
    throw new Error('deadline must be >= ResolveAfter + 30min');
  }
  const target = spec.comparisonOp === '==' ? `at position ${spec.threshold}` : `in top-${spec.threshold}`;
  const question = `Will "${spec.trackName}" by ${spec.artistName} be ${target} on Apple Music ${spec.country.toUpperCase()} most-played at ${spec.resolveAfterUtc}?`;
  const resolutionCriteria =
    `Kind: music\n` +
    `Provider: itunes_rss\n` +
    `Country: ${spec.country}\n` +
    `Chart: ${spec.chart}\n` +
    `TrackId: ${spec.trackId}\n` +
    `TrackName: ${spec.trackName}\n` +
    `ArtistName: ${spec.artistName}\n` +
    `ResolveAfter: ${spec.resolveAfterUtc}\n` +
    `Field: position\n` +
    `Comparison: position ${spec.comparisonOp} ${spec.threshold}\n` +
    `TieBreak: NO\n`;
  return {
    spec,
    question,
    description:
      `Binary outcome on Apple Music ${spec.country.toUpperCase()} ${spec.chart} chart at ${spec.resolveAfterUtc}. ` +
      `Resolves YES iff the track id ${spec.trackId} ("${spec.trackName}" by ${spec.artistName}) ` +
      `is ${target} when the chart is fetched once at the snapshot moment. If the track has fallen out of the top-10 ` +
      `by that time, the market resolves NO.`,
    resolutionSource: `https://rss.marketingtools.apple.com/api/v2/${spec.country}/music/${spec.chart}/10/songs.json`,
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
  // every minute. Retry on stale-version aborts; SDK rebuilds the gas selection
  // on each call so a fresh attempt picks up the latest coin.
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
          tx.pure.string('music'),
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
    console.error('SPECS is empty. Edit create-music-batch.ts.');
    process.exit(1);
  }
  const markets = SPECS.map(buildMarket);
  for (const m of markets) {
    console.log(`--- ${m.spec.label} ---`);
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
    process.stdout.write(`  [${m.spec.label}] creating... `);
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
