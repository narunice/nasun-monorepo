/**
 * Demo Agent Configuration
 *
 * Constants and configuration for the DeFi Trader + Budget Guardian demo.
 * Uses Nasun Devnet (Chain ID: 272218f1).
 */

// ========== Network ==========

export const RPC_URL = 'https://rpc.devnet.nasun.io';
export const FAUCET_URL = 'https://faucet.devnet.nasun.io';
export const CLOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

// ========== Contract Addresses ==========

// Baram (escrow + budget) — latest upgraded package (v6, with SettlementReceipt)
export const BARAM_PACKAGE_ID = '0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9';
export const BARAM_REGISTRY = '0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833';

// Agent Profile
export const AGENT_PACKAGE_ID = '0x05edb7edec6e69af66e5d2564e6ca7cb46b60469a0897291c51f8d5c949424de';
export const AGENT_PROFILE_REGISTRY = '0x1e236dfab7e4c3df21651fa4b5dc846d8d1bed314a2615474dd1b805445b9f11';

// AER — latest upgraded package (v3)
export const AER_PACKAGE_ID = '0x809f22f2262fd4211e51c1d890addfaeadb21e4bbf61748d7714306272427692';
export const AER_REGISTRY = '0xf1acc0794f5aa692de3f825953b708f940c5ccd83655bf79fe0c520052588583';

// Tokens
export const TOKENS_PACKAGE_ID = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
export const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
export const NUSDC_TYPE = `${TOKENS_PACKAGE_ID}::nusdc::NUSDC`;

// DeepBook V3
export const DEEPBOOK_PACKAGE_ID = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';
export const NBTC_NUSDC_POOL = '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0';
export const NBTC_TYPE = `${TOKENS_PACKAGE_ID}::nbtc::NBTC`;

// ========== Budget Parameters ==========

export const BUDGET_DEPOSIT = 50_000_000;         // 50 NUSDC (6 decimals)
export const BUDGET_MAX_PER_REQUEST = 5_000_000;   // 5 NUSDC
export const DAILY_LIMIT = 20_000_000;             // 20 NUSDC
export const WEEKLY_LIMIT = 40_000_000;            // 40 NUSDC
export const MONTHLY_LIMIT = 50_000_000;           // 50 NUSDC
export const MIN_INTERVAL_MS = 0;                  // No rate limiting for demo

// ========== Demo Scenarios ==========

export const SCENARIOS = [
  {
    name: 'AI Market Analysis',
    category: 'ai_inference',
    price: 1_000_000,   // 1 NUSDC
    prompt: 'Analyze BTC/USD market conditions and provide a short-term trading signal.',
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'Risk Assessment',
    category: 'ai_inference',
    price: 2_000_000,   // 2 NUSDC
    prompt: 'Assess portfolio risk for holding 0.01 BTC at current prices.',
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'Fill Daily Budget',
    category: 'ai_inference',
    price: 5_000_000,   // 5 NUSDC
    prompt: 'Generate a comprehensive DeFi yield farming strategy.',
    model: 'llama-3.3-70b-versatile',
  },
] as const;

// ========== Prompt Hash ==========

export const PROMPT_HASH_LENGTH = 32; // SHA-256

// ========== Move Type References ==========

// For constructing type arguments in transactions
export const BUDGET_TYPE = `${BARAM_PACKAGE_ID}::budget::Budget`;
export const AGENT_PROFILE_TYPE = `${AGENT_PACKAGE_ID}::agent_profile::AgentProfile`;
export const AGENT_REGISTRY_TYPE = `${AGENT_PACKAGE_ID}::agent_profile::AgentProfileRegistry`;

// ========== Logging Helpers ==========

export function timestamp(): string {
  return new Date().toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function log(msg: string): void {
  console.log(`[${timestamp()}] ${msg}`);
}

export function logSection(title: string): void {
  console.log('');
  console.log(`${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
}

export function logSuccess(msg: string): void {
  log(`[OK] ${msg}`);
}

export function logBlocked(msg: string): void {
  log(`[BLOCKED] Budget Guardian: ${msg}`);
}

export function logError(msg: string): void {
  log(`[ERROR] ${msg}`);
}

export function formatNUSDC(amount: number | bigint): string {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  return `${(n / 1_000_000).toFixed(2)} NUSDC`;
}
