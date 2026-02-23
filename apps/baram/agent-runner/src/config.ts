/**
 * Agent Runner configuration — loads and validates environment variables
 */

import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const MIN_INTERVAL_MINUTES = 5;
const CLOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

export type PresetName = 'research' | 'content' | 'analysis';

interface PresetDefaults {
  intervalMinutes: number;
  category: string;
}

const PRESET_DEFAULTS: Record<PresetName, PresetDefaults> = {
  research: { intervalMinutes: 30, category: 'research' },
  content: { intervalMinutes: 1440, category: 'content' },
  analysis: { intervalMinutes: 1440, category: 'analysis' },
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
  if (url.protocol !== 'https:') {
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

export function loadConfig() {
  const preset = (process.env.PRESET ?? 'research') as PresetName;
  if (!(preset in PRESET_DEFAULTS)) {
    throw new Error(`Invalid PRESET: ${preset}. Must be: research, content, analysis`);
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

  return {
    keypair,
    agentAddress: keypair.toSuiAddress(),

    // Baram contracts
    packageId: requireEnv('BARAM_PACKAGE_ID'),
    registryId: requireEnv('BARAM_REGISTRY_ID'),
    budgetId: requireEnv('BUDGET_ID'),
    clockId: CLOCK_ID,

    // Executor
    lambdaUrl: requireHttpsUrl(requireEnv('LAMBDA_URL'), 'LAMBDA_URL'),
    apiKey: requireEnv('BARAM_API_KEY'),
    executorAddress: requireEnv('EXECUTOR_ADDRESS'),

    // Agent behavior
    model: process.env.MODEL ?? 'llama-3.3-70b-versatile',
    preset,
    category: defaults.category,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    price: parsePriceOrDefault(process.env.PRICE, 1000000),

    // Network
    rpcUrl: process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io',
  } as const;
}

export type Config = ReturnType<typeof loadConfig>;
