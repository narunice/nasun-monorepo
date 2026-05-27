/**
 * Mixed prediction-market batch (2026-05-27).
 *
 * 10 binary markets across space (LL2), weather (Open-Meteo), crypto
 * (Binance), and stocks (Twelve Data + Yahoo). Two-week horizon to fill
 * the gap before the 2026-06-30 batch markets resolve.
 *
 * Sports markets are intentionally omitted from this batch: TheSportsDB
 * free tier did not surface major international fixtures within the
 * 2-week window. Add via a follow-up batch once eventIds are known.
 *
 * All resolver kinds are already wired into prediction-keeper. LP bot
 * auto-discovers new markets on the 10-min cycle (no .env edit needed).
 *
 * Required env: PREDICTION_RESOLVER_ADDRESS, PREDICTION_PACKAGE_ID,
 *               PREDICTION_ADMIN_CAP (optional default).
 * Admin signer: PREDICTION_ADMIN_KEY env OR active sui keystore address.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/create-mixed-batch-2026-05-27.ts --dry-run
 *   node --env-file=.env --import tsx scripts/create-mixed-batch-2026-05-27.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
const MIN_DEADLINE_AFTER_RESOLVE_MS = 30 * 60_000;

// ===== Specs =====

type Category = 'space' | 'sports' | 'weather' | 'crypto' | 'finance';

interface SpaceSpec {
  kind: 'space';
  launchId: string;
  missionName: string;
  netUtc: string;
  pad: string;
  field: 'mission_success' | 'on_schedule_24h';
}

interface WeatherSpec {
  kind: 'weather';
  locationName: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  field: 'temperature_max_over' | 'precipitation_sum_over' | 'rainy_days_over';
  aggregation: 'max' | 'mean' | 'sum' | 'count';
  threshold: number;
}

interface CryptoSpec {
  kind: 'crypto';
  symbol: string;
  binanceSymbol: string;
  displayName: string;
  decimals: number;
  threshold: number;
  closeUtc: string;
}

interface StockSpec {
  kind: 'stock';
  ticker: string;
  market: 'US' | 'KRX';
  currency: 'USD' | 'KRW';
  displayName: string;
  threshold: number;
  closeUtc: string;
}

type Spec = SpaceSpec | WeatherSpec | CryptoSpec | StockSpec;

const SPECS: Spec[] = [
  // ===== Crypto (2) =====
  {
    kind: 'crypto',
    symbol: 'BTC',
    binanceSymbol: 'BTCUSDT',
    displayName: 'Bitcoin',
    decimals: 0,
    threshold: 110000,
    closeUtc: '2026-06-10 23:59:00 UTC',
  },
  {
    kind: 'crypto',
    symbol: 'ETH',
    binanceSymbol: 'ETHUSDT',
    displayName: 'Ethereum',
    decimals: 2,
    threshold: 2600,
    closeUtc: '2026-06-10 23:59:00 UTC',
  },

  // ===== Stock (1) =====
  {
    kind: 'stock',
    ticker: 'NVDA',
    market: 'US',
    currency: 'USD',
    displayName: 'NVIDIA',
    threshold: 245,
    closeUtc: '2026-06-05 20:00:00 UTC',
  },

  // ===== Weather (1) =====
  {
    kind: 'weather',
    locationName: 'Seoul',
    latitude: 37.5665,
    longitude: 126.9780,
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    field: 'rainy_days_over',
    aggregation: 'count',
    threshold: 3,
  },
];

// ===== Helpers =====

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

function loadActiveSuiKeystoreKeypair(): Ed25519Keypair {
  const cfgPath = join(homedir(), '.sui', 'sui_config', 'client.yaml');
  const ksPath = join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const cfg = readFileSync(cfgPath, 'utf-8');
  const m = /active_address:\s*"?(0x[0-9a-fA-F]+)"?/.exec(cfg);
  if (!m) throw new Error(`active_address not found in ${cfgPath}`);
  const activeAddr = m[1].toLowerCase();

  const keys: string[] = JSON.parse(readFileSync(ksPath, 'utf-8'));
  for (const k of keys) {
    const raw = Buffer.from(k, 'base64');
    if (raw[0] !== 0x00) continue;
    const priv = raw.subarray(1);
    if (priv.length !== 32) continue;
    const kp = Ed25519Keypair.fromSecretKey(priv);
    if (kp.toSuiAddress().toLowerCase() === activeAddr) return kp;
  }
  throw new Error(`No ed25519 keystore entry matches active address ${activeAddr}`);
}

interface Market {
  spec: Spec;
  category: Category;
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildSpaceMarket(spec: SpaceSpec): Market {
  const netMs = parseUtc(spec.netUtc);
  const closeTimeMs = netMs - 5 * 60_000;
  if (spec.field === 'mission_success') {
    const resolveAfterMs = netMs + 4 * 60 * 60_000;
    const resolveDeadlineMs = netMs + 30 * 24 * 60 * 60_000;
    const criteria =
      `Kind: space\n` +
      `Provider: ll2\n` +
      `LaunchId: ${spec.launchId}\n` +
      `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
      `Field: mission_success\n` +
      `SuccessStatusIds: 3\n` +
      `TieBreak: NO\n`;
    return {
      spec, category: 'space',
      question: `🚀 Will ${spec.missionName} succeed?`,
      description:
        `Binary outcome on the mission's Launch Library 2 status at NET + 4h. ` +
        `Resolves YES iff status.id == 3 ("Success"). NO for status 4 ("Failure") or 7 ("Partial Failure"). ` +
        `Pad: ${spec.pad}. Scheduled NET: ${spec.netUtc}.`,
      resolutionSource: `https://ll.thespacedevs.com/2.2.0/launch/${spec.launchId}/`,
      resolutionCriteria: criteria,
      closeTimeMs,
      resolveDeadlineMs,
    };
  }
  const resolveAfterMs = netMs + 25 * 3600_000;
  const resolveDeadlineMs = netMs + 30 * 24 * 60 * 60_000;
  const criteria =
    `Kind: space\n` +
    `Provider: ll2\n` +
    `LaunchId: ${spec.launchId}\n` +
    `ResolveAfter: ${fmtUtc(resolveAfterMs)}\n` +
    `Field: on_schedule_24h\n` +
    `ScheduledNet: ${spec.netUtc}\n` +
    `ToleranceSec: 86400\n` +
    `TieBreak: NO\n`;
  return {
    spec, category: 'space',
    question: `🚀 Will ${spec.missionName} lift off within ±24h of its scheduled NET?`,
    description:
      `Binary outcome on the actual liftoff timestamp vs the scheduled NET ` +
      `(${spec.netUtc}). Resolves YES iff LL2 status is terminal AND observed ` +
      `net time falls within ±24h of the scheduled NET. Repeated scrubs that ` +
      `push the launch beyond ±24h resolve NO. Pad: ${spec.pad}.`,
    resolutionSource: `https://ll.thespacedevs.com/2.2.0/launch/${spec.launchId}/`,
    resolutionCriteria: criteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

function buildWeatherMarket(spec: WeatherSpec): Market {
  const endMs = Date.parse(`${spec.endDate}T00:00:00Z`);
  const resolveAfterMs = endMs + 24 * 60 * 60_000;
  const closeTimeMs = endMs;
  const resolveDeadlineMs = endMs + 14 * 24 * 60 * 60_000;
  if (resolveDeadlineMs < resolveAfterMs + MIN_DEADLINE_AFTER_RESOLVE_MS) {
    throw new Error('weather: deadline < ResolveAfter + 30min');
  }

  const fieldDesc: Record<WeatherSpec['field'], string> = {
    temperature_max_over: 'daily maximum temperature (°C)',
    precipitation_sum_over: 'daily precipitation total (mm)',
    rainy_days_over: 'count of days with > 1 mm precipitation',
  };
  const unit = spec.field === 'temperature_max_over' ? '°C'
    : spec.field === 'precipitation_sum_over' ? 'mm'
    : ' days';
  const verb = spec.field === 'rainy_days_over'
    ? fieldDesc[spec.field]
    : `${spec.aggregation} ${fieldDesc[spec.field]}`;
  const range = spec.startDate === spec.endDate
    ? `on ${spec.startDate}`
    : `during ${spec.startDate} through ${spec.endDate}`;

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
  return {
    spec, category: 'weather',
    question: `☁️ Will ${spec.locationName} record ${verb} > ${spec.threshold}${unit} ${range}?`,
    description:
      `Binary outcome on Open-Meteo's historical-weather archive for ${spec.locationName} ` +
      `(lat ${spec.latitude}, lon ${spec.longitude}). Resolves YES iff the ${spec.aggregation} of ` +
      `${fieldDesc[spec.field]} across ${spec.startDate} to ${spec.endDate} (UTC, inclusive) ` +
      `exceeds ${spec.threshold}${unit}. Data is fetched once after ${fmtUtc(resolveAfterMs)}.`,
    resolutionSource:
      `https://archive-api.open-meteo.com/v1/archive?latitude=${spec.latitude}&longitude=${spec.longitude}` +
      `&start_date=${spec.startDate}&end_date=${spec.endDate}` +
      `&daily=temperature_2m_max,precipitation_sum&timezone=UTC`,
    resolutionCriteria: criteria,
    closeTimeMs,
    resolveDeadlineMs,
  };
}

function buildCryptoMarket(spec: CryptoSpec): Market {
  const closeMs = parseUtc(spec.closeUtc);
  const resolveDeadlineMs = closeMs + 2 * 60 * 60_000;
  const fmt = (v: number) => v.toLocaleString('en-US', {
    minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals,
  });
  const sourceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${spec.binanceSymbol}`;
  return {
    spec, category: 'crypto',
    question: `Will ${spec.displayName} (${spec.symbol}/USDT) close above $${fmt(spec.threshold)} on Binance at ${spec.closeUtc}?`,
    description:
      `Binary spot-price prediction. Resolves YES if the Binance ticker for ${spec.binanceSymbol} ` +
      `reports a price > ${fmt(spec.threshold)} USDT at ${spec.closeUtc}; NO otherwise. ` +
      `CoinGecko is used as a fallback price source if Binance is unavailable.`,
    resolutionSource: sourceUrl,
    resolutionCriteria:
      `Source: ${sourceUrl}\nReading time: ${spec.closeUtc}\n` +
      `Comparison: price > ${spec.threshold}\nTie-breaking: NO`,
    closeTimeMs: closeMs,
    resolveDeadlineMs,
  };
}

function buildStockMarket(spec: StockSpec): Market {
  const closeMs = parseUtc(spec.closeUtc);
  const resolveDeadlineMs = closeMs + 3 * 24 * 60 * 60_000;
  const sourceUrl = spec.market === 'KRX'
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.ticker)}`
    : `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(spec.ticker)}&interval=1day`;
  const sessionDate = spec.closeUtc.slice(0, 10);
  const thresholdHuman = spec.currency === 'KRW'
    ? `${spec.threshold.toLocaleString('en-US')} KRW`
    : `${spec.threshold.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${spec.currency}`;
  const sourceDesc = spec.market === 'KRX'
    ? `Price is read from Yahoo Finance (Twelve Data free tier does not list KRX). `
    : `Price is read from Twelve Data with Yahoo Finance as a cross-source check (5% agreement required). `;
  return {
    spec, category: 'finance',
    question: `Will ${spec.displayName} (${spec.ticker}) close above ${thresholdHuman} on ${sessionDate}?`,
    description:
      `Daily-close prediction. Resolves YES if the regular-session close of ${spec.ticker} on ${sessionDate} ` +
      `(${spec.market}) is > ${thresholdHuman}; NO otherwise. ${sourceDesc}` +
      `Pre-market and after-hours prices are not used.`,
    resolutionSource: sourceUrl,
    resolutionCriteria:
      `Source: ${sourceUrl}\nSymbol: ${spec.ticker}\nCurrency: ${spec.currency}\n` +
      `Reading time: ${spec.closeUtc}\nComparison: close > ${spec.threshold}\nTie-breaking: NO`,
    closeTimeMs: closeMs,
    resolveDeadlineMs,
  };
}

function buildMarket(spec: Spec): Market {
  switch (spec.kind) {
    case 'space':   return buildSpaceMarket(spec);
    case 'weather': return buildWeatherMarket(spec);
    case 'crypto':  return buildCryptoMarket(spec);
    case 'stock':   return buildStockMarket(spec);
  }
}

const TRANSIENT = /not available for consumption|current version|ObjectVersionUnavailable|already locked|reference is not available|EquivocationDetected|HTTP (?:429|5\d\d)|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i;

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
      if (!TRANSIENT.test(msg) || attempt === 4) throw err;
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
  throw lastErr;
}

function specLabel(spec: Spec): string {
  switch (spec.kind) {
    case 'space': return `[space] ${spec.missionName} / ${spec.field}`;
    case 'weather': return `[weather] ${spec.locationName} ${spec.field} > ${spec.threshold}`;
    case 'crypto': return `[crypto] ${spec.symbol} > $${spec.threshold} @ ${spec.closeUtc}`;
    case 'stock': return `[stock] ${spec.ticker} > ${spec.threshold} ${spec.currency} @ ${spec.closeUtc}`;
  }
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const markets = SPECS.map(buildMarket);

  for (const m of markets) {
    console.log(`--- ${specLabel(m.spec)} ---`);
    console.log(`  Q: ${m.question}`);
    console.log(`  closeTime: ${fmtUtc(m.closeTimeMs)}`);
    console.log(`  deadline:  ${fmtUtc(m.resolveDeadlineMs)}`);
    console.log('');
  }

  if (dry) { console.log(`[DRY RUN] ${markets.length} markets planned.`); return; }

  let admin: Ed25519Keypair;
  if (process.env.PREDICTION_ADMIN_KEY) {
    admin = parseKeypair(process.env.PREDICTION_ADMIN_KEY);
  } else {
    admin = loadActiveSuiKeystoreKeypair();
  }
  const adminAddr = admin.toSuiAddress().toLowerCase();

  const resolver = requireHex64(
    'PREDICTION_RESOLVER_ADDRESS', requireEnv('PREDICTION_RESOLVER_ADDRESS'),
  );
  if (adminAddr === resolver) { console.error('admin == resolver'); process.exit(1); }
  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const cap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);
  const client = new SuiClient({ url: RPC_URL });

  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== adminAddr) {
    console.error(`AdminCap not owned by admin (cap_owner=${capOwner}, admin=${adminAddr})`); process.exit(1);
  }

  console.log(`Creating ${markets.length} markets (resolver=${resolver})\n`);
  const created: Array<{ label: string; id: string }> = [];
  for (const m of markets) {
    const label = specLabel(m.spec);
    process.stdout.write(`  ${label} ... `);
    try {
      const id = await createOnChain(client, admin, packageId, cap, resolver, m);
      console.log(id);
      created.push({ label, id });
      await new Promise((res) => setTimeout(res, 4000));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nCreated ${created.length}/${markets.length} markets:`);
  for (const { label, id } of created) console.log(`  ${id}  ${label}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
