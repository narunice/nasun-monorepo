/**
 * SpaceX prediction-market batch creator.
 *
 * For the next upcoming SpaceX launch (Launch Library 2), emits two binary
 * markets:
 *
 *   1. Mission Success        -- Will [mission] succeed (LL2 status.id == 3)?
 *   2. Launch On Schedule     -- Will [mission] lift off within +/- 24h of NET?
 *
 * Resolver address is derived from PREDICTION_RESOLVER_KEY (no env override).
 * The market spec asserts `resolve_deadline >= ResolveAfter + 30min` so the
 * keeper's fetch + sign + confirm path never collides with the on-chain
 * `now <= resolve_deadline` assert.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY           admin keypair (suiprivkey1... or 0x-hex)
 *   PREDICTION_ADMIN_CAP           AdminCap object id (optional, defaulted)
 *   PREDICTION_PACKAGE_ID          deployed contract id
 *   PREDICTION_RESOLVER_KEY        keeper privkey for derive-only resolver address
 *   NASUN_RPC_URL                  default https://rpc.devnet.nasun.io
 *   LL2_API_KEY                    optional; raises rate limit
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/create-spacex-batch.ts --dry-run
 *   node --import tsx apps/pado/bots/scripts/create-spacex-batch.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';


const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) {
  console.error('This script must not run against mainnet. Aborting.');
  process.exit(1);
}

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
const RESOLVE_AFTER_BUFFER_MS = 4 * 60 * 60_000;          // status final 4h after NET
const RESOLVE_DEADLINE_BUFFER_MS = 30 * 86400_000;         // 30 days for repeated scrubs
const MIN_DEADLINE_AFTER_RESOLVE_MS = 30 * 60_000;        // invariant: deadline >= ResolveAfter + 30min

function parseKeypair(keyInput: string): Ed25519Keypair {
  if (keyInput.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(keyInput);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const cleanKey = keyInput.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanKey)) throw new Error('Invalid privkey (hex64 or suiprivkey)');
  return Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`${name} is required`); process.exit(1); }
  return v;
}

function requireHex64(name: string, value: string): string {
  if (!HEX_64.test(value)) {
    console.error(`${name} must be 0x-prefixed 32-byte hex (got: ${value})`);
    process.exit(1);
  }
  return value.toLowerCase();
}

function formatUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

interface LL2Launch {
  id: string;
  name: string;
  status: { id: number; abbrev: string; name: string };
  net: string;
  pad?: { name?: string; location?: { name?: string } };
  mission?: { description?: string };
}

async function fetchNextSpaceXLaunch(): Promise<LL2Launch> {
  const base = process.env.LL2_BASE || 'https://ll.thespacedevs.com/2.2.0';
  const url = `${base}/launch/upcoming/?lsp__name=SpaceX&limit=1`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.LL2_API_KEY) headers.Authorization = `Token ${process.env.LL2_API_KEY}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`LL2 HTTP ${res.status}`);
  const body = (await res.json()) as { results?: LL2Launch[] };
  const first = body.results?.[0];
  if (!first) throw new Error('No upcoming SpaceX launches');
  return first;
}

interface MarketSpec {
  label: string;
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  category: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildSpecs(launch: LL2Launch): MarketSpec[] {
  const netMs = Date.parse(launch.net);
  if (!Number.isFinite(netMs)) throw new Error(`bad LL2 net: ${launch.net}`);
  const resolveAfterMs = netMs + RESOLVE_AFTER_BUFFER_MS;
  const closeTimeMs = netMs - 5 * 60_000;                  // close 5min before NET
  const resolveDeadlineMs = netMs + RESOLVE_DEADLINE_BUFFER_MS;

  // invariant: deadline must give the keeper at least 30 min after the
  // intended snapshot window or `resolve_market` will abort on-chain.
  if (resolveDeadlineMs < resolveAfterMs + MIN_DEADLINE_AFTER_RESOLVE_MS) {
    throw new Error(
      `resolve_deadline (${formatUtc(resolveDeadlineMs)}) < ResolveAfter + 30min (${formatUtc(resolveAfterMs + MIN_DEADLINE_AFTER_RESOLVE_MS)})`,
    );
  }

  const padName = launch.pad?.name ?? 'unknown pad';
  const resolveAfterUtc = formatUtc(resolveAfterMs);

  // 1. Mission Success
  const successCriteria =
    `Kind: space\n` +
    `Provider: ll2\n` +
    `LaunchId: ${launch.id}\n` +
    `ResolveAfter: ${resolveAfterUtc}\n` +
    `Field: mission_success\n` +
    `SuccessStatusIds: 3\n` +
    `TieBreak: NO\n`;
  const successSpec: MarketSpec = {
    label: `${launch.name} -- success`,
    question: `Will ${launch.name} succeed?`,
    description:
      `Binary outcome on the mission's Launch Library 2 status at NET + 4h. ` +
      `Resolves YES iff status.id == 3 ("Success"). ` +
      `Resolves NO for status.id 4 ("Failure") or 7 ("Partial Failure"). ` +
      `Pad: ${padName}. Scheduled NET: ${formatUtc(netMs)}.`,
    resolutionSource: `https://ll.thespacedevs.com/2.2.0/launch/${launch.id}/`,
    resolutionCriteria: successCriteria,
    category: 'space',
    closeTimeMs,
    resolveDeadlineMs,
  };

  // 2. Launch On Schedule
  const onScheduleCriteria =
    `Kind: space\n` +
    `Provider: ll2\n` +
    `LaunchId: ${launch.id}\n` +
    `ResolveAfter: ${formatUtc(netMs + 25 * 3600_000)}\n` +
    `Field: on_schedule_24h\n` +
    `ScheduledNet: ${formatUtc(netMs)}\n` +
    `ToleranceSec: 86400\n` +
    `TieBreak: NO\n`;
  const onScheduleSpec: MarketSpec = {
    label: `${launch.name} -- on schedule 24h`,
    question: `Will ${launch.name} lift off within +/- 24h of its scheduled NET?`,
    description:
      `Binary outcome on the actual liftoff timestamp vs the scheduled NET ` +
      `recorded at market creation (${formatUtc(netMs)}). Resolves YES iff the ` +
      `Launch Library 2 status is terminal (Success/Failure/Partial) AND the ` +
      `observed net time falls within +/- 24h of the scheduled NET. Repeated ` +
      `scrubs that push the launch beyond the +/- 24h window resolve NO.`,
    resolutionSource: `https://ll.thespacedevs.com/2.2.0/launch/${launch.id}/`,
    resolutionCriteria: onScheduleCriteria,
    category: 'space',
    closeTimeMs,
    resolveDeadlineMs,
  };

  return [successSpec, onScheduleSpec];
}

// Admin wallet is shared with price-updater bot which bumps gas-coin versions
// every minute. Retry on stale-version / locked-object / transient RPC errors.
const TRANSIENT_TX_ERROR_RE =
  /not available for consumption|current version|ObjectVersionUnavailable|already locked|reference is not available|EquivocationDetected|HTTP (?:429|5\d\d)|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i;

async function createMarket(
  client: SuiClient,
  adminKp: Ed25519Keypair,
  packageId: string,
  adminCap: string,
  resolverAddress: string,
  spec: MarketSpec,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::prediction_market::create_market`,
        arguments: [
          tx.object(adminCap),
          tx.pure.string(spec.question),
          tx.pure.string(spec.description),
          tx.pure.string(spec.category),
          tx.pure.string(spec.resolutionSource),
          tx.pure.string(spec.resolutionCriteria),
          tx.pure.u64(BigInt(spec.closeTimeMs)),
          tx.pure.u64(BigInt(spec.resolveDeadlineMs)),
          tx.pure.address(resolverAddress),
          tx.object(CLOCK_ID),
        ],
      });
      const result = await client.signAndExecuteTransaction({
        signer: adminKp, transaction: tx,
        options: { showEffects: true, showObjectChanges: true },
      });
      if (result.effects?.status?.status !== 'success') {
        throw new Error(`TX failed: ${result.effects?.status?.error ?? 'unknown'}`);
      }
      await client.waitForTransaction({ digest: result.digest });
      const created = result.objectChanges?.find(
        (c): c is { type: 'created'; objectType: string; objectId: string } =>
          c.type === 'created' &&
          typeof (c as { objectType?: string }).objectType === 'string' &&
          (c as { objectType: string }).objectType.endsWith('::prediction_market::Market'),
      );
      if (!created) throw new Error(`Market object not in objectChanges. Digest: ${result.digest}`);
      return created.objectId;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_TX_ERROR_RE.test(msg) || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Fetching next SpaceX launch from LL2...');
  const launch = await fetchNextSpaceXLaunch();
  console.log(`  id=${launch.id}`);
  console.log(`  name=${launch.name}`);
  console.log(`  status.id=${launch.status.id} (${launch.status.abbrev})`);
  console.log(`  net=${launch.net}`);
  console.log(`  pad=${launch.pad?.name ?? 'unknown'}`);
  console.log('');

  const specs = buildSpecs(launch);
  for (const s of specs) {
    console.log(`--- ${s.label} ---`);
    console.log(`  Q: ${s.question}`);
    console.log(`  closeTime: ${formatUtc(s.closeTimeMs)}`);
    console.log(`  deadline:  ${formatUtc(s.resolveDeadlineMs)}`);
    console.log(`  criteria:`);
    for (const ln of s.resolutionCriteria.split('\n').filter(Boolean)) {
      console.log(`    ${ln}`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('[DRY RUN] No markets created.');
    return;
  }

  const adminKp = parseKeypair(requireEnv('PREDICTION_ADMIN_KEY'));
  const adminAddress = adminKp.toSuiAddress().toLowerCase();

  // Resolver address must be DERIVED from PREDICTION_RESOLVER_KEY, never env-supplied.
  const resolverKp = parseKeypair(requireEnv('PREDICTION_RESOLVER_KEY'));
  const resolverAddress = resolverKp.toSuiAddress().toLowerCase();
  if (process.env.PREDICTION_RESOLVER_ADDRESS) {
    const expected = requireHex64('PREDICTION_RESOLVER_ADDRESS', process.env.PREDICTION_RESOLVER_ADDRESS);
    if (expected !== resolverAddress) {
      console.error(
        `Resolver address mismatch:\n  env=${expected}\n  derived=${resolverAddress}\n` +
        `Refusing to create markets that the keeper cannot resolve.`,
      );
      process.exit(1);
    }
  }
  if (adminAddress === resolverAddress) {
    console.error('Admin wallet must differ from resolver wallet (ECreatorIsResolver).');
    process.exit(1);
  }

  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const adminCap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);

  const client = new SuiClient({ url: RPC_URL });
  const capObj = await client.getObject({ id: adminCap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (!capOwner || capOwner.toLowerCase() !== adminAddress) {
    console.error(`AdminCap ${adminCap} owned by ${capOwner ?? 'unknown'}, not ${adminAddress}. Aborting.`);
    process.exit(1);
  }

  console.log(`Creating ${specs.length} markets`);
  console.log(`  Package:  ${packageId}`);
  console.log(`  AdminCap: ${adminCap}`);
  console.log(`  Creator:  ${adminAddress}`);
  console.log(`  Resolver: ${resolverAddress} (derived)`);
  console.log('');

  const created: Array<{ label: string; id: string }> = [];
  for (const s of specs) {
    process.stdout.write(`  [${s.label}] creating... `);
    try {
      const id = await createMarket(client, adminKp, packageId, adminCap, resolverAddress, s);
      console.log(id);
      created.push({ label: s.label, id });
      await new Promise((r) => setTimeout(r, 4000));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('');
  console.log(`Created ${created.length}/${specs.length} markets:`);
  for (const { label, id } of created) console.log(`  ${id}  ${label}`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
