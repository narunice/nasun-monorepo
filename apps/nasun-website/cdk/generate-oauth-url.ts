/**
 * @Naru010110 계정용 OAuth 2.0 인증 URL 생성 스크립트
 *
 * 사용법:
 * npx tsx cdk/generate-oauth-url.ts
 */

import { config } from 'dotenv';
import * as path from 'path';

// .env 파일 로드
config({ path: path.join(__dirname, '.env') });

import { createAuthorizationRequest } from './lambda-src/x-leaderboard/src/utils/oauth2-helper';
import { getEnvConfigV2 } from './lambda-src/x-leaderboard/src/utils/env';
import * as fs from 'fs';

async function main() {
  console.log('🔐 OAuth 2.0 인증 URL 생성 중...\n');

  // 환경 설정 로드
  const config = getEnvConfigV2();

  console.log('📋 OAuth 2.0 설정 확인:');
  console.log(`   Client ID: ${config.oauth2ClientId}`);
  console.log(`   Redirect URI: ${config.oauth2RedirectUri}`);
  console.log(`   Scopes: tweet.read users.read follows.read offline.access like.read list.read\n`);

  // Authorization Request 생성
  const authRequest = createAuthorizationRequest(config);

  // State와 Code Verifier를 파일에 저장 (나중에 사용)
  const authData = {
    state: authRequest.state,
    codeVerifier: authRequest.codeVerifier,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync('/tmp/oauth-auth-data.json', JSON.stringify(authData, null, 2));
  console.log('✅ State와 Code Verifier 저장됨: /tmp/oauth-auth-data.json\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔗 다음 URL을 브라우저에서 열어주세요:\n');
  console.log(authRequest.authorizationUrl);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📝 다음 단계:');
  console.log('   1. 위 URL을 복사하여 브라우저에서 열기');
  console.log('   2. @Naru010110 계정으로 로그인');
  console.log('   3. 앱 권한 승인');
  console.log('   4. Redirect된 URL에서 "code" 파라미터 복사');
  console.log('   5. npx tsx exchange-oauth-code.ts <CODE> 실행\n');
}

main().catch(error => {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
});
