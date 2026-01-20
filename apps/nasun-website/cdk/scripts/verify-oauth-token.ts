/**
 * OAuth 2.0 토큰 검증 스크립트
 *
 * Secrets Manager에 저장된 OAuth 2.0 토큰이 현재 환경의 올바른 타겟 계정으로
 * 인증되어 있는지 확인합니다.
 *
 * 중요: 이 스크립트는 현재 AWS 자격 증명을 사용하여 Secrets Manager에 접근합니다.
 * - 개발 환경: 기본 AWS 프로필 사용 (계정 __AWS_DEV_ACCOUNT__)
 * - 프로덕션 환경: `AWS_PROFILE=nasun-prod` 사용 (계정 __AWS_PROD_ACCOUNT__)
 *
 * 사용법:
 *   cd apps/nasun-website/cdk
 *
 *   # 개발 환경 (기본 AWS 프로필)
 *   npx tsx scripts/verify-oauth-token.ts              # 개발 환경 검증 (기본값)
 *   npx tsx scripts/verify-oauth-token.ts --env=dev    # 개발 환경 검증
 *
 *   # 프로덕션 환경 (프로덕션 AWS 프로필 필요)
 *   AWS_PROFILE=nasun-prod npx tsx scripts/verify-oauth-token.ts --env=prod
 *
 *   # 참고: --all 옵션은 프로덕션 AWS 자격 증명 없이는 프로덕션 검증에 실패합니다
 */

import { TwitterApi } from 'twitter-api-v2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// 명령줄 인수 파싱
function parseArgs(): { environments: ('development' | 'production')[] } {
  const args = process.argv.slice(2);

  if (args.includes('--all')) {
    return { environments: ['development', 'production'] };
  }

  const envArg = args.find(a => a.startsWith('--env='));
  if (envArg) {
    const envValue = envArg.split('=')[1];
    if (envValue === 'prod' || envValue === 'production') {
      return { environments: ['production'] };
    } else if (envValue === 'dev' || envValue === 'development') {
      return { environments: ['development'] };
    }
  }

  // Default to development
  return { environments: ['development'] };
}

// 환경별 설정
const ENV_CONFIGS = {
  development: {
    envFile: '.env.development',
    secretName: 'nasun-twitter-tokens',
    targetUserId: '1863020068785004544',
    targetUsername: 'Naru010110',
    awsAccount: '__AWS_DEV_ACCOUNT__',
    awsRegion: 'ap-northeast-2',
  },
  production: {
    envFile: '.env.production',
    secretName: 'nasun-twitter-tokens-prod',
    targetUserId: '1725466995565752320',
    targetUsername: 'Nasun_io',
    awsAccount: '__AWS_PROD_ACCOUNT__',
    awsRegion: 'ap-northeast-2',
  },
};

interface EnvConfig {
  envFile: string;
  secretName: string;
  targetUserId: string;
  targetUsername: string;
  awsAccount: string;
  awsRegion: string;
  environment: 'development' | 'production';
}

function loadEnvConfig(env: 'development' | 'production'): EnvConfig {
  // dotenv 오버라이드 문제를 방지하기 위해 ENV_CONFIGS의 하드코딩된 값 사용
  // (dotenv는 기존 환경 변수를 덮어쓰지 않아 환경 간 오염 발생)
  return {
    ...ENV_CONFIGS[env],
    environment: env,
  };
}

// 리더보드 파이프라인에 필요한 OAuth 2.0 스코프
const REQUIRED_SCOPES = ['like.read', 'tweet.read', 'users.read', 'offline.access'];

interface TokenVerificationResult {
  isValid: boolean;
  authenticatedUser: {
    id: string;
    username: string;
    name: string;
  } | null;
  expectedUser: {
    id: string | undefined;
    username: string | undefined;
  };
  accountMatch: boolean;
  tokenExpiry: Date | null;
  isExpired: boolean;
  expiresInMinutes: number;
  scopes: string[];
  missingScopes: string[];
  errors: string[];
  config: EnvConfig;
}

async function verifyOAuthToken(config: EnvConfig): Promise<TokenVerificationResult> {
  const result: TokenVerificationResult = {
    isValid: false,
    authenticatedUser: null,
    expectedUser: {
      id: config.targetUserId,
      username: config.targetUsername,
    },
    accountMatch: false,
    tokenExpiry: null,
    isExpired: true,
    expiresInMinutes: 0,
    scopes: [],
    missingScopes: [],
    errors: [],
    config,
  };

  try {
    // 1. Secrets Manager에서 토큰 가져오기
    const secretsClient = new SecretsManagerClient({ region: config.awsRegion });
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: config.secretName })
    );

    if (!secretResponse.SecretString) {
      result.errors.push('Secret이 비어있습니다');
      return result;
    }

    const tokens = JSON.parse(secretResponse.SecretString);
    const oauth2 = tokens.oauth2;

    if (!oauth2?.userAccessToken) {
      result.errors.push('Secret에서 OAuth 2.0 userAccessToken을 찾을 수 없습니다');
      return result;
    }

    // 2. 토큰 만료 확인
    if (oauth2.expiresAt) {
      result.tokenExpiry = new Date(oauth2.expiresAt);
      result.expiresInMinutes = Math.floor((result.tokenExpiry.getTime() - Date.now()) / 1000 / 60);
      result.isExpired = result.expiresInMinutes <= 0;
    }

    // 3. 스코프 확인
    const scopeString = oauth2.scope || '';
    result.scopes = scopeString.split(' ').filter(Boolean);
    result.missingScopes = REQUIRED_SCOPES.filter(s => !result.scopes.includes(s));

    // 4. Twitter API를 통해 인증된 사용자 확인
    const client = new TwitterApi(oauth2.userAccessToken);
    const me = await client.v2.me();

    result.authenticatedUser = {
      id: me.data.id,
      username: me.data.username,
      name: me.data.name,
    };

    // 5. 계정 일치 여부 확인
    result.accountMatch =
      result.authenticatedUser.id === config.targetUserId ||
      result.authenticatedUser.username.toLowerCase() === config.targetUsername?.toLowerCase();

    // 6. 최종 유효성 판정
    result.isValid =
      result.accountMatch &&
      !result.isExpired &&
      result.missingScopes.length === 0;

  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

function printResult(result: TokenVerificationResult): void {
  const { config } = result;
  const envLabel = config.environment === 'development' ? '개발' : '프로덕션';

  console.log('\n' + '='.repeat(60));
  console.log(` OAuth 2.0 토큰 검증 리포트 [${envLabel.toUpperCase()}]`);
  console.log('='.repeat(60));

  console.log(`\n[환경 정보]`);
  console.log(`  환경:         ${envLabel}`);
  console.log(`  Secret 이름:  ${config.secretName}`);
  console.log(`  AWS 계정:     ${config.awsAccount}`);
  console.log(`  AWS 리전:     ${config.awsRegion}`);

  console.log(`\n[기대하는 타겟 계정]`);
  console.log(`  사용자명: @${config.targetUsername || '미설정'}`);
  console.log(`  User ID:  ${config.targetUserId || '미설정'}`);

  console.log(`\n[인증된 계정]`);
  if (result.authenticatedUser) {
    console.log(`  사용자명: @${result.authenticatedUser.username}`);
    console.log(`  User ID:  ${result.authenticatedUser.id}`);
    console.log(`  이름:     ${result.authenticatedUser.name}`);
  } else {
    console.log(`  오류: 인증된 사용자 정보를 가져올 수 없습니다`);
  }

  console.log(`\n[계정 일치 여부]`);
  if (result.accountMatch) {
    console.log(`  OK: 인증된 계정이 타겟 계정과 일치합니다`);
  } else {
    console.log(`  불일치: 인증된 계정이 타겟 계정과 일치하지 않습니다!`);
    console.log(`  기대값: @${config.targetUsername} (${config.targetUserId})`);
    console.log(`  실제값: @${result.authenticatedUser?.username} (${result.authenticatedUser?.id})`);
  }

  console.log(`\n[토큰 만료]`);
  if (result.tokenExpiry) {
    const status = result.isExpired ? '만료됨' : '유효';
    console.log(`  상태:     ${status}`);
    console.log(`  만료시간: ${result.tokenExpiry.toISOString()}`);
    console.log(`  남은시간: ${result.expiresInMinutes}분`);
  } else {
    console.log(`  경고: 만료 시간이 설정되지 않았습니다`);
  }

  console.log(`\n[OAuth 2.0 스코프]`);
  console.log(`  부여됨: ${result.scopes.join(', ') || '없음'}`);
  if (result.missingScopes.length > 0) {
    console.log(`  누락됨: ${result.missingScopes.join(', ')}`);
  } else {
    console.log(`  필수 스코프 모두 포함됨`);
  }

  if (result.errors.length > 0) {
    console.log(`\n[오류]`);
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log('\n' + '='.repeat(60));
  if (result.isValid) {
    console.log(` 결과: ${envLabel.toUpperCase()} 토큰이 유효합니다`);
  } else {
    console.log(` 결과: ${envLabel.toUpperCase()} 토큰에 문제가 있습니다`);
    console.log('\n 권장 조치:');
    if (!result.accountMatch) {
      console.log('   1. 실행: npx tsx setup-oauth2-auto.ts');
      console.log(`   2. 브라우저에서 @${config.targetUsername} 계정으로 로그인`);
      console.log('   3. 앱 권한 승인');
    }
    if (result.isExpired) {
      console.log('   - 토큰 만료됨: setup-oauth2-auto.ts 실행하여 갱신');
    }
    if (result.missingScopes.length > 0) {
      console.log('   - 스코프 누락: 올바른 스코프로 재인증 필요');
    }
  }
  console.log('='.repeat(60) + '\n');
}

function printSummary(results: TokenVerificationResult[]): void {
  if (results.length <= 1) return;

  console.log('\n' + '#'.repeat(60));
  console.log(' 요약');
  console.log('#'.repeat(60));

  for (const result of results) {
    const envLabel = result.config.environment === 'development' ? '개발' : '프로덕션';
    const status = result.isValid ? '유효' : '문제있음';
    const icon = result.isValid ? 'OK' : 'NG';
    console.log(`  [${icon}] ${envLabel.padEnd(8)} - ${status}`);
    if (!result.isValid) {
      if (!result.accountMatch) {
        console.log(`       -> 계정 불일치: @${result.authenticatedUser?.username || '알수없음'} != @${result.config.targetUsername}`);
      }
      if (result.isExpired) {
        console.log(`       -> 토큰 만료됨`);
      }
      if (result.errors.length > 0) {
        console.log(`       -> 오류: ${result.errors[0]}`);
      }
    }
  }

  console.log('#'.repeat(60) + '\n');
}

async function main() {
  const { environments } = parseArgs();

  console.log('OAuth 2.0 토큰 검증');
  const envNames = environments.map(e => e === 'development' ? '개발' : '프로덕션');
  console.log(`검증 대상: ${envNames.join(', ')}`);

  const results: TokenVerificationResult[] = [];
  let hasError = false;

  for (const env of environments) {
    const config = loadEnvConfig(env);
    const result = await verifyOAuthToken(config);
    printResult(result);
    results.push(result);

    if (!result.isValid) {
      hasError = true;
    }
  }

  // 여러 환경 검증 시 요약 출력
  printSummary(results);

  // 유효하지 않은 토큰이 있으면 에러 코드로 종료
  process.exit(hasError ? 1 : 0);
}

main().catch(error => {
  console.error('치명적 오류:', error);
  process.exit(1);
});
