/**
 * Environment Variable Validation
 * 앱 시작 시 필수 환경변수 검증
 */

interface EnvConfig {
  name: string;
  value: string | undefined;
  required: boolean;
}

const ENV_VARS: EnvConfig[] = [
  // Core Network (기본값 있음)
  { name: 'VITE_RPC_URL', value: import.meta.env.VITE_RPC_URL, required: false },
  { name: 'VITE_FAUCET_URL', value: import.meta.env.VITE_FAUCET_URL, required: false },
  { name: 'VITE_CHAIN_ID', value: import.meta.env.VITE_CHAIN_ID, required: false },

  // DeepBook V3 (필수)
  { name: 'VITE_DEEPBOOK_PACKAGE', value: import.meta.env.VITE_DEEPBOOK_PACKAGE, required: true },
  { name: 'VITE_DEEPBOOK_REGISTRY', value: import.meta.env.VITE_DEEPBOOK_REGISTRY, required: true },

  // Tokens (필수)
  { name: 'VITE_TOKENS_PACKAGE', value: import.meta.env.VITE_TOKENS_PACKAGE, required: true },
  { name: 'VITE_NBTC_TYPE', value: import.meta.env.VITE_NBTC_TYPE, required: true },
  { name: 'VITE_NUSDC_TYPE', value: import.meta.env.VITE_NUSDC_TYPE, required: true },

  // Pool (필수)
  { name: 'VITE_POOL_NBTC_NUSDC', value: import.meta.env.VITE_POOL_NBTC_NUSDC, required: true },

  // Token Faucet (필수)
  { name: 'VITE_FAUCET_PACKAGE', value: import.meta.env.VITE_FAUCET_PACKAGE, required: true },
  { name: 'VITE_TOKEN_FAUCET', value: import.meta.env.VITE_TOKEN_FAUCET, required: true },
];

/**
 * 환경변수 검증
 * @returns 누락된 필수 환경변수 목록
 */
export function validateEnv(): string[] {
  const missing: string[] = [];

  for (const env of ENV_VARS) {
    if (env.required && !env.value) {
      missing.push(env.name);
    }
  }

  return missing;
}

/**
 * 환경변수 검증 및 경고 출력
 * 개발 모드에서만 콘솔에 경고 표시
 */
export function validateEnvWithWarning(): void {
  const missing = validateEnv();

  if (missing.length > 0) {
    const message = `Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join('\n')}`;

    if (import.meta.env.DEV) {
      console.warn(`⚠️ ${message}\n\nCreate a .env.local file with these variables.`);
    } else {
      // Production에서는 에러로 처리
      console.error(`❌ ${message}`);
    }
  } else if (import.meta.env.DEV) {
    console.log('✅ All required environment variables are set');
  }
}

/**
 * 환경변수 요약 출력 (개발 모드 전용)
 */
export function logEnvSummary(): void {
  if (!import.meta.env.DEV) return;

  console.group('🔧 Environment Configuration');
  console.log('RPC URL:', import.meta.env.VITE_RPC_URL || '(default)');
  console.log('Chain ID:', import.meta.env.VITE_CHAIN_ID || '(default)');
  console.log('DeepBook Package:', import.meta.env.VITE_DEEPBOOK_PACKAGE || '❌ Missing');
  console.log('Pool:', import.meta.env.VITE_POOL_NBTC_NUSDC || '❌ Missing');
  console.groupEnd();
}
