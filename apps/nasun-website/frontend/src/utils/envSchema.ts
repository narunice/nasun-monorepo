// src/utils/envSchema.ts
import { z } from "zod";

// 1. 네트워크 타입 정의
const NetworkType = z.enum(["testnet", "devnet", "mainnet", "localnet", "nasundevnet"]);
export type NetworkType = z.infer<typeof NetworkType>;
// 이후 currentNetwork: NetworkType 으로 선언
export const currentNetwork = process.env.VITE_NETWORK as NetworkType;

// 2. 기본 환경 변수 스키마
const BaseEnvSchema = z.object({
  // 1. 네트워크 설정
  VITE_NETWORK: NetworkType.default("mainnet"),

  // 2. AWS & 인프라 설정
  VITE_AWS_REGION: z.string().min(1),
  VITE_COGNITO_IDENTITY_POOL_ID: z.string().min(1),

  // API 엔드포인트
  VITE_RANDOM_IMAGE_API_ENDPOINT: z.string().url(),
  VITE_WALLET_API_ENDPOINT: z.string().url(),
  VITE_PRICE_API_ENDPOINT: z.string().url(),
  VITE_BACKUP_API_ENDPOINT: z.string().url(),

  // 3. Assets 콘텐츠 필터링
  VITE_FILTER_STRINGS: z.string(),

  // 4. 웹사이트 설정
  VITE_NASUN_URL: z.string().url(),
  VITE_GENSOL_URL: z.string().url(),

  // 5. 워드프레스 설정
  VITE_WORDPRESS_DOMAIN: z.string().url(),
  // WP credentials use non-VITE_ prefix (WP_USERNAME, WP_PASSWORD) — server-only, never in client bundle

  // 6. CSP 정책 (다중 라인 문자열 허용)
  VITE_CSP_POLICY: z.string().optional(),

  // 7. Authentication
  VITE_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  VITE_TWITTER_AUTH_API: z.string().url().optional(),
  VITE_LINK_ACCOUNT_API: z.string().url().optional(),
  VITE_USER_PROFILE_API: z.string().url().optional(),

  // 8. EVM Wallet / Ethereum
  VITE_ENABLE_WALLET_LOGIN: z.enum(["true", "false"]).default("false"),
  VITE_ETHEREUM_CHAIN_ID: z.string().default("1"),

  // 9. Battalion NFT Event
  VITE_EVENT_TWEET_ID: z.string().optional(),
  VITE_TARGET_TWEET_ACCOUNT: z.string().default("Nasun_io"),

  // 10. Genesis Pass Allowlist
  VITE_GENESIS_PASS_API: z.string().url().optional(),
});

// 3. 환경별 추가 검증 로직
export const EnvSchema = BaseEnvSchema.refine((data) => {
  // 네트워크별 추가 검증
  if (data.VITE_NETWORK === "mainnet") {
    // 메인넷 전용 검증 로직
    if (!data.VITE_CSP_POLICY?.includes("mainnet")) {
      console.warn("CSP 정책에 mainnet 관련 도메인이 포함되어 있지 않습니다.");
    }
  }
  return true;
});

// 타입 추출
export type EnvVariables = z.infer<typeof EnvSchema>;
