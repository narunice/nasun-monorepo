/**
 * Environment Variable Validation
 * Validates presence, format (URL, Object ID) at app startup
 */

// ========================================
// Format Validators
// ========================================

/** Validate Sui object ID format: 0x + 64 hex chars */
function isValidObjectId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** Validate URL format (absolute or relative path like "/rpc") */
function isValidUrl(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Validate Sui type string format: 0x<hex>::module::Type or 0x2::sui::SUI */
function isValidSuiType(value: string): boolean {
  return /^0x[0-9a-fA-F]+::\w+::\w+/.test(value);
}

// ========================================
// Environment Variable Definitions
// ========================================

type EnvFormat = 'object_id' | 'url' | 'sui_type' | 'string';

interface EnvConfig {
  name: string;
  value: string | undefined;
  required: boolean;
  format?: EnvFormat;
}

const ENV_VARS: EnvConfig[] = [
  // Core Network (defaults available)
  { name: 'VITE_RPC_URL', value: import.meta.env.VITE_RPC_URL, required: false, format: 'url' },
  { name: 'VITE_FAUCET_URL', value: import.meta.env.VITE_FAUCET_URL, required: false, format: 'url' },
  { name: 'VITE_CHAIN_ID', value: import.meta.env.VITE_CHAIN_ID, required: false },

  // DeepBook V3 (required)
  { name: 'VITE_DEEPBOOK_PACKAGE', value: import.meta.env.VITE_DEEPBOOK_PACKAGE, required: true, format: 'object_id' },
  { name: 'VITE_DEEPBOOK_REGISTRY', value: import.meta.env.VITE_DEEPBOOK_REGISTRY, required: true, format: 'object_id' },

  // Tokens (required)
  { name: 'VITE_TOKENS_PACKAGE', value: import.meta.env.VITE_TOKENS_PACKAGE, required: true, format: 'object_id' },
  { name: 'VITE_NBTC_TYPE', value: import.meta.env.VITE_NBTC_TYPE, required: true, format: 'sui_type' },
  { name: 'VITE_NUSDC_TYPE', value: import.meta.env.VITE_NUSDC_TYPE, required: true, format: 'sui_type' },

  // Pool (required)
  { name: 'VITE_POOL_NBTC_NUSDC', value: import.meta.env.VITE_POOL_NBTC_NUSDC, required: true, format: 'object_id' },

  // Tokens V2 (optional — NETH, NSOL pools)
  { name: 'VITE_TOKENS_V2_PACKAGE', value: import.meta.env.VITE_TOKENS_V2_PACKAGE, required: false, format: 'object_id' },
  { name: 'VITE_NETH_TYPE', value: import.meta.env.VITE_NETH_TYPE, required: false, format: 'sui_type' },
  { name: 'VITE_NSOL_TYPE', value: import.meta.env.VITE_NSOL_TYPE, required: false, format: 'sui_type' },
  { name: 'VITE_POOL_NETH_NUSDC', value: import.meta.env.VITE_POOL_NETH_NUSDC, required: false, format: 'object_id' },
  { name: 'VITE_POOL_NSOL_NUSDC', value: import.meta.env.VITE_POOL_NSOL_NUSDC, required: false, format: 'object_id' },
  { name: 'VITE_POOL_NASUN_NUSDC', value: import.meta.env.VITE_POOL_NASUN_NUSDC, required: false, format: 'object_id' },

  // Token Faucet (required)
  { name: 'VITE_FAUCET_PACKAGE', value: import.meta.env.VITE_FAUCET_PACKAGE, required: true, format: 'object_id' },
  { name: 'VITE_TOKEN_FAUCET', value: import.meta.env.VITE_TOKEN_FAUCET, required: true, format: 'object_id' },

  // Token Faucet V2 (optional)
  { name: 'VITE_TOKEN_FAUCET_V2', value: import.meta.env.VITE_TOKEN_FAUCET_V2, required: false, format: 'object_id' },
  { name: 'VITE_NETH_FAUCET_V2', value: import.meta.env.VITE_NETH_FAUCET_V2, required: false, format: 'object_id' },

  // Oracle (optional)
  { name: 'VITE_ORACLE_REGISTRY_ID', value: import.meta.env.VITE_ORACLE_REGISTRY_ID, required: false, format: 'object_id' },
];

// ========================================
// Validation Functions
// ========================================

function validateFormat(env: EnvConfig): string | null {
  if (!env.value || !env.format) return null;

  switch (env.format) {
    case 'object_id':
      if (!isValidObjectId(env.value)) {
        return `${env.name}: invalid Object ID format (expected 0x + 64 hex chars, got "${env.value.slice(0, 20)}...")`;
      }
      break;
    case 'url':
      if (!isValidUrl(env.value)) {
        return `${env.name}: invalid URL format (got "${env.value}")`;
      }
      break;
    case 'sui_type':
      if (!isValidSuiType(env.value)) {
        return `${env.name}: invalid Sui type format (expected 0x<hex>::module::Type, got "${env.value.slice(0, 30)}...")`;
      }
      break;
  }
  return null;
}

/**
 * Validate environment variables
 * @returns Object with missing required vars and format errors
 */
export function validateEnv(): { missing: string[]; formatErrors: string[] } {
  const missing: string[] = [];
  const formatErrors: string[] = [];

  for (const env of ENV_VARS) {
    if (env.required && !env.value) {
      missing.push(env.name);
      continue;
    }
    const formatError = validateFormat(env);
    if (formatError) {
      formatErrors.push(formatError);
    }
  }

  return { missing, formatErrors };
}

/**
 * Validate environment variables and log warnings/errors
 * In production, format errors are treated as hard errors
 */
export function validateEnvWithWarning(): void {
  const { missing, formatErrors } = validateEnv();
  const hasIssues = missing.length > 0 || formatErrors.length > 0;

  if (!hasIssues) {
    if (import.meta.env.DEV) {
      console.log('[Env] All required environment variables are set and valid');
    }
    return;
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join('\n')}`;
    if (import.meta.env.DEV) {
      console.warn(`[Env] ${message}\n\nCreate a .env.local file with these variables.`);
    } else {
      console.error(`[Env] ${message}`);
    }
  }

  if (formatErrors.length > 0) {
    const message = `Environment variable format errors:\n${formatErrors.map((e) => `  - ${e}`).join('\n')}`;
    if (import.meta.env.DEV) {
      console.warn(`[Env] ${message}`);
    } else {
      // Production: format errors indicate misconfiguration
      console.error(`[Env] ${message}`);
    }
  }
}

/**
 * Environment summary (dev mode only)
 */
export function logEnvSummary(): void {
  if (!import.meta.env.DEV) return;

  console.group('[Env] Configuration');
  console.log('RPC URL:', import.meta.env.VITE_RPC_URL || '(default)');
  console.log('Chain ID:', import.meta.env.VITE_CHAIN_ID || '(default)');
  console.log('DeepBook Package:', import.meta.env.VITE_DEEPBOOK_PACKAGE || 'MISSING');
  console.log('Pool:', import.meta.env.VITE_POOL_NBTC_NUSDC || 'MISSING');
  console.log('Oracle Registry:', import.meta.env.VITE_ORACLE_REGISTRY_ID || '(not configured)');
  console.groupEnd();
}
