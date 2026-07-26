/**
 * Prediction-market batch (2026-06-30, devnet v8 "V10-v8reset").
 *
 * A fresh, real-event batch across three auto-resolvable categories, all
 * verified live this session against the exact APIs the keeper resolves with:
 *   crypto  (Binance spot)       -> 3 (BTC / ETH / SOL)
 *   space   (Launch Library 2)   -> 2 (South Korean ADD demo / Electron iQPS-7)
 *   sports  (TheSportsDB)        -> 1 (FIFA World Cup 2026 R16: NED vs MAR)
 *
 * Canonical ids pinned from packages/devnet-config/devnet-ids.json
 * ("V10-v8reset", 2026-06-19), identical to the 2026-06-22 batch:
 *   package   0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9 (Immutable)
 *   AdminCap  0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac
 *             owned by admin 0x98f5339a... (keystore alias admin-v8)
 *   resolver  0x5cbc8390... (LIVE keeper wallet, distinct from creator)
 * The committed bots/.env is stale, so package/cap/resolver are hardcoded and
 * the signer is loaded in-memory from ~/.sui/sui_config/sui.keystore (AdminCap
 * owner). Override with PREDICTION_ADMIN_KEY_OVERRIDE only if not in keystore.
 *
 * Live data verified 2026-06-29 22:55 UTC (machine clock; KST 2026-06-30 07:55):
 *   Binance spot: BTC=60418.01 ETH=1615.61 SOL=75.43
 *   LL2 upcoming (status Go):
 *     South Korean ADD Solid-Fuel SLV Demo Flight
 *       9e27a1ed-e81a-4918-b32b-0380cf3a9f8f  net 2026-06-30 05:00:00Z
 *     Electron "The Grain Goddess Provides" (iQPS Launch 7)
 *       8b7e748c-6ed5-4681-a898-827b4a23b8d7  net 2026-07-01 13:00:00Z
 *   TheSportsDB FIFA World Cup (league 4429), status NS:
 *     2499836  Netherlands vs Morocco  2026-06-30 01:00:00Z  (R16)
 *   (Brazil vs Japan 2499835 already FT 2-1 this session -> excluded.)
 *
 * Crypto thresholds are pinned just off spot for genuine toss-ups. Every
 * criteria block is self-validated against the live keeper parsers in
 * --dry-run, so a format mistake throws before anything goes on-chain.
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-06-30.ts --dry-run
 *   node --import tsx apps/pado/bots/scripts/create-full-batch-2026-06-30.ts            # live
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';
import { parseSpaceCriteria } from '../lib/resolvers/space.js';
import { parseSportsCriteria } from '../lib/resolvers/sports.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const CANON_PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const CANON_ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
const CANON_RESOLVER = '0x5cbc8390ae709b0358f304fd76691dda1f03eae514a9592153125c8cff23aeb0';
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

interface SportsSpec {
  kind: 'sports';
  label: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
}

type Spec = CryptoSpec | SpaceSpec | SportsSpec;

// ===== batch definition =====
const SPECS: Spec[] = [
  // --- crypto: close 2026-07-06 23:59 UTC (~1 week); lines just off spot ---
  { kind: 'crypto', label: 'BTC>61k',  symbol: 'BTCUSDT', display: 'BTC', threshold: 61000, comparator: '>', closeUtc: '2026-07-06 23:59:00 UTC' },
  { kind: 'crypto', label: 'ETH>1650', symbol: 'ETHUSDT', display: 'ETH', threshold: 1650,  comparator: '>', closeUtc: '2026-07-06 23:59:00 UTC' },
  { kind: 'crypto', label: 'SOL>77',   symbol: 'SOLUSDT', display: 'SOL', threshold: 77,    comparator: '>', closeUtc: '2026-07-06 23:59:00 UTC' },
  // --- space ---
  {
    kind: 'space', label: 'ADD SLV demo',
    launchId: '9e27a1ed-e81a-4918-b32b-0380cf3a9f8f',
    launchName: 'South Korean ADD Solid-Fuel SLV Demo Flight',
    scheduledNet: '2026-06-30 05:00:00 UTC',
    closeUtc: '2026-06-30 04:30:00 UTC',
    resolveAfterUtc: '2026-06-30 07:00:00 UTC',
    deadlineUtc: '2026-07-07 00:00:00 UTC',
  },
  {
    kind: 'space', label: 'Electron iQPS-7',
    launchId: '8b7e748c-6ed5-4681-a898-827b4a23b8d7',
    launchName: 'Electron "The Grain Goddess Provides" (iQPS Launch 7)',
    scheduledNet: '2026-07-01 13:00:00 UTC',
    closeUtc: '2026-07-01 12:30:00 UTC',
    resolveAfterUtc: '2026-07-01 15:00:00 UTC',
    deadlineUtc: '2026-07-08 00:00:00 UTC',
  },
  // --- sports: FIFA World Cup 2026 R16 ---
  { kind: 'sports', label: 'NED-MAR', league: 'FIFA World Cup', eventId: '2499836', homeTeam: 'Netherlands', awayTeam: 'Morocco', kickoffUtc: '2026-06-30 01:00:00 UTC' },
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
  category: 'crypto' | 'space' | 'sports';
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
  // sports
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
    question: `\u{26BD} ${spec.league} - Will ${spec.homeTeam} beat ${spec.awayTeam}?`,
    description:
      `Binary outcome on the full-time score of the ${spec.league} fixture ` +
      `${spec.homeTeam} vs ${spec.awayTeam} (kickoff ${spec.kickoffUtc}). ` +
      `Resolves YES iff ${spec.homeTeam}'s final score is strictly greater than ${spec.awayTeam}'s. ` +
      `A draw resolves NO. If the match is postponed past the resolve deadline the market is auto-cancelled.`,
    resolutionSource: source, resolutionCriteria: criteria,
    closeTimeMs: closeMs, resolveDeadlineMs: deadlineMs,
  };
}

/** Parse each built criteria with the real keeper parser; format errors throw. */
function selfValidate(spec: Spec, m: Market): void {
  if (spec.kind === 'crypto') {
    const parsed = parseResolutionCriteria(m.resolutionCriteria);
    if (!parsed) throw new Error(`${m.label}: crypto criteria failed parser`);
    if (parsed.kind !== 'crypto') throw new Error(`${m.label}: parsed kind ${parsed.kind} != crypto`);
  } else if (spec.kind === 'space') {
    parseSpaceCriteria(m.resolutionCriteria);
  } else {
    parseSportsCriteria(m.resolutionCriteria);
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
