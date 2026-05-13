/**
 * Agent Runner configuration — loads and validates environment variables
 */

import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { resolveStrategyPreset, type StrategyPreset } from './presets/strategies.js';

const MIN_INTERVAL_MINUTES = 5;
const CLOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

export type PresetName = 'research' | 'content' | 'analysis' | 'trader';
export type RunMode = 'lambda' | 'record';

interface PresetDefaults {
  intervalMinutes: number;
  category: string;
}

const PRESET_DEFAULTS: Record<PresetName, PresetDefaults> = {
  research: { intervalMinutes: 30, category: 'research' },
  content: { intervalMinutes: 1440, category: 'content' },
  analysis: { intervalMinutes: 1440, category: 'analysis' },
  trader: { intervalMinutes: 30, category: 'ai_inference' },
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireHttpsUrl(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL: ${raw}`);
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error(`${name} must use HTTPS (got ${url.protocol})`);
  }
  return raw;
}

function loadKeypair(raw: string): Ed25519Keypair {
  // Bech32 format from Dashboard "Export Key" (suiprivkey1q...)
  if (raw.startsWith('suiprivkey1')) {
    return Ed25519Keypair.fromSecretKey(raw);
  }
  // Hex format (64 hex chars = 32 byte secret key, with optional 0x prefix)
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
  }
  // Base64 format — validate decoded length is exactly 32 bytes (Ed25519 secret key)
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) {
    throw new Error(
      `AGENT_PRIVATE_KEY: invalid key length (${decoded.length} bytes, expected 32). ` +
      `Supported formats: Bech32 (suiprivkey1q...), hex (64 chars), or base64 (32 bytes).`
    );
  }
  return Ed25519Keypair.fromSecretKey(decoded);
}

function parsePriceOrDefault(raw: string | undefined, defaultPrice: number): number {
  if (!raw) return defaultPrice;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[config] PRICE="${raw}" is not a valid positive number. Using default (${defaultPrice}).`);
    return defaultPrice;
  }
  return parsed;
}

// Trader-only env validators. Pulled out so the non-trader presets keep
// booting unchanged when the trader-specific vars are absent.
function requireObjectId(raw: string, name: string): string {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(raw)) {
    throw new Error(`${name} must be 0x<hex>: got "${raw.slice(0, 12)}..."`);
  }
  return raw;
}

function requireAddress(raw: string, name: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`${name} must be 0x<64-hex>: got "${raw.slice(0, 12)}..."`);
  }
  return raw;
}

function parseBigIntEnv(raw: string | undefined, name: string, fallback: bigint): bigint {
  if (raw === undefined || raw === '') return fallback;
  try {
    const v = BigInt(raw);
    if (v < 0n) throw new Error('negative');
    return v;
  } catch {
    throw new Error(`${name} must be a non-negative integer (got "${raw}")`);
  }
}

interface TraderConfig {
  hostUrl: string;
  capabilityId: string;
  walletAddress: string;
  strategy: StrategyPreset;
  maxNotionalQuoteRaw: bigint;
  dailyMaxQuoteRaw: bigint;
  maxSlippageBps: number;
  /** Plan C C3-v2 §5.4: shared AgentEscrow object id paired to the cap. */
  escrowId: string;
  /** Fully-qualified TypeName for the input/output coin pair. The trader
   *  alternates which is input vs output per BUY/SELL. */
  coinNusdcType: string;
  coinNbtcType: string;
}

function requireTypeName(raw: string, name: string): string {
  if (!/^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]{0,254}::[A-Za-z_][A-Za-z0-9_]{0,254}(<.+>)?$/.test(raw)) {
    throw new Error(`${name} must be a Move TypeName (<addr>::<mod>::<Type>): got "${raw.slice(0, 32)}..."`);
  }
  return raw;
}

function loadTraderConfig(): TraderConfig {
  const hostUrl = requireHttpsUrl(requireEnv('HOST_URL'), 'HOST_URL');
  const capabilityId = requireObjectId(requireEnv('CAPABILITY_ID'), 'CAPABILITY_ID');
  const walletAddress = requireAddress(requireEnv('WALLET_ADDRESS'), 'WALLET_ADDRESS');
  const escrowId = requireObjectId(requireEnv('ESCROW_ID'), 'ESCROW_ID');
  const coinNusdcType = requireTypeName(requireEnv('COIN_NUSDC_TYPE'), 'COIN_NUSDC_TYPE');
  const coinNbtcType = requireTypeName(requireEnv('COIN_NBTC_TYPE'), 'COIN_NBTC_TYPE');
  const strategy = resolveStrategyPreset(process.env.STRATEGY);
  const maxNotionalQuoteRaw = parseBigIntEnv(
    process.env.MAX_NOTIONAL_QUOTE_RAW,
    'MAX_NOTIONAL_QUOTE_RAW',
    2_000_000n,
  );
  const dailyMaxQuoteRaw = parseBigIntEnv(
    process.env.DAILY_MAX_QUOTE_RAW,
    'DAILY_MAX_QUOTE_RAW',
    20_000_000n,
  );
  const maxSlippageBpsRaw = process.env.MAX_SLIPPAGE_BPS;
  let maxSlippageBps = 100;
  if (maxSlippageBpsRaw) {
    const parsed = Number(maxSlippageBpsRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
      throw new Error('MAX_SLIPPAGE_BPS must be an integer in [0, 10000]');
    }
    maxSlippageBps = parsed;
  }
  return {
    hostUrl,
    capabilityId,
    walletAddress,
    strategy,
    maxNotionalQuoteRaw,
    dailyMaxQuoteRaw,
    maxSlippageBps,
    escrowId,
    coinNusdcType,
    coinNbtcType,
  };
}

export function loadConfig() {
  const preset = (process.env.PRESET ?? 'research') as PresetName;
  if (!(preset in PRESET_DEFAULTS)) {
    throw new Error(`Invalid PRESET: ${preset}. Must be: research, content, analysis, trader`);
  }

  const defaults = PRESET_DEFAULTS[preset];
  const parsedInterval = process.env.INTERVAL_MINUTES ? parseInt(process.env.INTERVAL_MINUTES, 10) : defaults.intervalMinutes;
  const rawInterval = isNaN(parsedInterval) ? defaults.intervalMinutes : parsedInterval;
  const intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, rawInterval);

  if (process.env.INTERVAL_MINUTES && isNaN(parsedInterval)) {
    console.warn(`[config] INTERVAL_MINUTES="${process.env.INTERVAL_MINUTES}" is not a valid number. Using default (${intervalMinutes}).`);
  } else if (rawInterval < MIN_INTERVAL_MINUTES) {
    console.warn(`[config] INTERVAL_MINUTES=${rawInterval} is below minimum (${MIN_INTERVAL_MINUTES}). Using ${intervalMinutes}.`);
  }

  const keypair = loadKeypair(requireEnv('AGENT_PRIVATE_KEY'));

  // Run mode: lambda (Model A) or record (Model B)
  const mode = (process.env.MODE ?? 'lambda') as RunMode;
  if (!['lambda', 'record'].includes(mode)) {
    throw new Error(`Invalid MODE: ${mode}. Must be: lambda, record`);
  }

  // Record mode requires LLM configuration
  const llmApiUrl = mode === 'record' ? requireHttpsUrl(requireEnv('LLM_API_URL'), 'LLM_API_URL') : '';
  const llmApiKey = mode === 'record' ? requireEnv('LLM_API_KEY') : '';
  const llmModel = mode === 'record' ? (process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile') : '';

  // Trader preset uses the host /execute-capability path; everything else
  // still routes through the Lambda /execute path (which is itself slated
  // for retirement in Plan E but kept alive for non-trader presets in C2).
  const trader = preset === 'trader' ? loadTraderConfig() : null;
  const lambdaUrl =
    preset === 'trader'
      ? (process.env.LAMBDA_URL ? requireHttpsUrl(process.env.LAMBDA_URL, 'LAMBDA_URL') : '')
      : requireHttpsUrl(requireEnv('LAMBDA_URL'), 'LAMBDA_URL');

  return {
    keypair,
    agentAddress: keypair.toSuiAddress(),

    // Baram contracts
    packageId: requireEnv('BARAM_PACKAGE_ID'),
    registryId: requireEnv('BARAM_REGISTRY_ID'),
    budgetId: requireEnv('BUDGET_ID'),
    clockId: CLOCK_ID,

    // Executor
    lambdaUrl,
    apiKey: requireEnv('BARAM_API_KEY'),
    executorAddress: requireEnv('EXECUTOR_ADDRESS'),

    // Trader-only (host /execute-capability path). null for non-trader presets.
    trader,

    // Agent behavior
    mode,
    model: process.env.MODEL ?? 'llama-3.3-70b-versatile',
    preset,
    category: defaults.category,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    price: parsePriceOrDefault(process.env.PRICE, 1000000),

    // Record mode (Model B) — LLM configuration
    llmApiUrl,
    llmApiKey,
    llmModel,

    // Network
    rpcUrl: process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io',

    // Single-cycle: run one cycle then exit (legacy cron compatibility; tests).
    singleCycle: process.env.SINGLE_CYCLE === 'true' || process.env.WAKE_MODEL === 'true',

    // Plan D D-3: inbound /wake HTTP server. 0 disables; default 4400 if env set.
    wakePort: parseWakePort(process.env.WAKE_PORT),

    // Plan D D-2: chat-server base URL for heartbeat registration.
    // e.g. http://127.0.0.1:3101 or https://nasun.io
    chatServerBaseUrl: process.env.CHAT_SERVER_BASE_URL ?? '',

    // Plan D D-4: baram_aer v1.4.0 package (Plan A + D-0b publish). Optional
    // until D-4 wires cognition AER PTBs.
    baramAerPackageId: process.env.BARAM_AER_PACKAGE_ID ?? '',

    // Optional Telegram notifications (trader preset only).
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID ?? null,
  } as const;
}

function parseWakePort(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1024 || n > 65535) {
    console.warn(`[config] WAKE_PORT="${raw}" out of range; disabling wake server.`);
    return 0;
  }
  return n;
}

export type Config = ReturnType<typeof loadConfig>;

/**
 * Mask API key for safe logging: show first 4 + last 4 chars
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
