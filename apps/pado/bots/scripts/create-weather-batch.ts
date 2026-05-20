/**
 * Weather prediction-market batch creator (Open-Meteo Archive).
 *
 * Emits one binary market per Spec. Field values supported by the resolver:
 *
 *   temperature_max_over    Aggregation: max | mean
 *   precipitation_sum_over  Aggregation: sum | max
 *   rainy_days_over         Aggregation: count   (counts days w/ precip > 1mm)
 *
 * Edit SPECS below before each run. Archive latency baseline (Phase 0.4):
 * T-12h non-null for Seoul/Tokyo, so ResolveAfter = endDate + 24h is safe.
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *        apps/pado/bots/scripts/create-weather-batch.ts --dry-run
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

type Field = 'temperature_max_over' | 'precipitation_sum_over' | 'rainy_days_over';
type Aggregation = 'max' | 'mean' | 'sum' | 'count';

interface Spec {
  locationName: string;
  latitude: number;
  longitude: number;
  startDate: string;          // YYYY-MM-DD
  endDate: string;            // YYYY-MM-DD inclusive
  field: Field;
  aggregation: Aggregation;
  threshold: number;
  /** Free-form market label, e.g. "Seoul max-temp Mon" */
  label: string;
  /** Optional override; default = endDate + 24h UTC */
  resolveAfterUtc?: string;
}

const SPECS: Spec[] = [
  {
    locationName: 'Seoul', latitude: 37.5665, longitude: 126.9780,
    startDate: '2026-05-19', endDate: '2026-05-25',
    field: 'temperature_max_over', aggregation: 'max', threshold: 30,
    label: 'Seoul weekly max-temp 5/19-25 > 30C',
  },
  {
    locationName: 'Ho Chi Minh City', latitude: 10.8231, longitude: 106.6297,
    startDate: '2026-05-19', endDate: '2026-05-25',
    field: 'rainy_days_over', aggregation: 'count', threshold: 3,
    label: 'HCMC rainy days 5/19-25 > 3',
  },
  {
    locationName: 'Frankfurt', latitude: 50.1109, longitude: 8.6821,
    startDate: '2026-05-19', endDate: '2026-05-25',
    field: 'temperature_max_over', aggregation: 'max', threshold: 25,
    label: 'Frankfurt weekly max-temp 5/19-25 > 25C',
  },
  {
    locationName: 'New York', latitude: 40.7128, longitude: -74.0060,
    startDate: '2026-05-19', endDate: '2026-05-25',
    field: 'temperature_max_over', aggregation: 'max', threshold: 25,
    label: 'NYC weekly max-temp 5/19-25 > 25C',
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
  const endMs = Date.parse(`${spec.endDate}T00:00:00Z`);
  if (!Number.isFinite(endMs)) throw new Error(`bad endDate: ${spec.endDate}`);
  const resolveAfterMs = spec.resolveAfterUtc
    ? parseUtc(spec.resolveAfterUtc)
    : endMs + 24 * 60 * 60_000;
  const closeTimeMs = Date.parse(`${spec.endDate}T00:00:00Z`);   // close at end-of-period
  const resolveDeadlineMs = endMs + 14 * 24 * 60 * 60_000;        // 14 days
  if (resolveDeadlineMs < resolveAfterMs + 30 * 60_000) {
    throw new Error('deadline must be >= ResolveAfter + 30min');
  }

  const fieldDesc: Record<Field, string> = {
    temperature_max_over: 'daily maximum temperature (°C)',
    precipitation_sum_over: 'daily precipitation total (mm)',
    rainy_days_over: 'count of days with > 1 mm precipitation',
  };
  const unit = spec.field === 'temperature_max_over' ? '°C'
    : spec.field === 'precipitation_sum_over' ? 'mm'
    : ' days';

  // rainy_days_over inherently aggregates as count, so we omit the aggregation word.
  const verbForQuestion = spec.field === 'rainy_days_over'
    ? fieldDesc[spec.field]
    : `${spec.aggregation} ${fieldDesc[spec.field]}`;
  const question = spec.startDate === spec.endDate
    ? `Will ${spec.locationName} record ${verbForQuestion} > ${spec.threshold}${unit} on ${spec.startDate}?`
    : `Will ${spec.locationName} record ${verbForQuestion} > ${spec.threshold}${unit} during ${spec.startDate} through ${spec.endDate}?`;

  const resolutionCriteria =
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

  return {
    spec,
    question,
    description:
      `Binary outcome on Open-Meteo's historical-weather archive for ${spec.locationName} ` +
      `(lat ${spec.latitude}, lon ${spec.longitude}). Resolves YES iff the ${spec.aggregation} of ${fieldDesc[spec.field]} ` +
      `across ${spec.startDate} to ${spec.endDate} (inclusive, UTC) exceeds ${spec.threshold}${unit}. ` +
      `Data is fetched once after ${fmtUtc(resolveAfterMs)} from archive-api.open-meteo.com.`,
    resolutionSource: `https://archive-api.open-meteo.com/v1/archive?latitude=${spec.latitude}&longitude=${spec.longitude}` +
      `&start_date=${spec.startDate}&end_date=${spec.endDate}` +
      `&daily=temperature_2m_max,precipitation_sum&timezone=UTC`,
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
          tx.pure.string('weather'),
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
    console.error('SPECS is empty. Edit create-weather-batch.ts.');
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
