/**
 * Authorization Code를 OAuth 2.0 Access Token으로 교환하는 스크립트
 *
 * 사용법:
 * npx tsx cdk/exchange-oauth-code.ts <AUTHORIZATION_CODE>
 */

import { config } from 'dotenv';
import * as path from 'path';

// .env 파일 로드
config({ path: path.join(__dirname, '.env') });

import { exchangeCodeForToken, calculateTokenExpiry } from './lambda-src/x-leaderboard/src/utils/oauth2-helper';
import { getEnvConfigV2 } from './lambda-src/x-leaderboard/src/utils/env';
import { SecretsManagerClient, UpdateSecretCommand, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as fs from 'fs';

async function main() {
  const authCode = process.argv[2];

  if (!authCode) {
    console.error('❌ 사용법: npx tsx exchange-oauth-code.ts <AUTHORIZATION_CODE>');
    process.exit(1);
  }

  console.log('🔄 OAuth 2.0 토큰 교환 중...\n');

  // 저장된 auth data 로드
  const authDataPath = '/tmp/oauth-auth-data.json';
  if (!fs.existsSync(authDataPath)) {
    console.error('❌ /tmp/oauth-auth-data.json 파일을 찾을 수 없습니다.');
    console.error('   먼저 generate-oauth-url.ts를 실행해주세요.');
    process.exit(1);
  }

  const authData = JSON.parse(fs.readFileSync(authDataPath, 'utf-8'));
  console.log(`📋 저장된 State: ${authData.state}`);
  console.log(`📋 Code Verifier: ${authData.codeVerifier.substring(0, 20)}...\n`);

  // 환경 설정 로드
  const config = getEnvConfigV2();

  console.log('\n🔍 OAuth 설정 확인:');
  console.log(`   Client ID: ${config.oauth2ClientId}`);
  console.log(`   Client Secret: ${config.oauth2ClientSecret ? 'Present (' + config.oauth2ClientSecret.length + ' chars)' : 'MISSING!'}`);
  console.log(`   Redirect URI: ${config.oauth2RedirectUri}\n`);

  try {
    // Authorization Code를 Access Token으로 교환
    console.log('🔐 토큰 교환 요청 중...');
    const tokenResponse = await exchangeCodeForToken(config, authCode, authData.codeVerifier);

    console.log('\n✅ OAuth 2.0 토큰 발급 성공!');
    console.log(`   Access Token: ${tokenResponse.access_token.substring(0, 30)}...`);
    console.log(`   Refresh Token: ${tokenResponse.refresh_token ? tokenResponse.refresh_token.substring(0, 30) + '...' : 'N/A'}`);
    console.log(`   Token Type: ${tokenResponse.token_type}`);
    console.log(`   Expires In: ${tokenResponse.expires_in} seconds (${Math.floor(tokenResponse.expires_in / 3600)} hours)`);
    console.log(`   Scope: ${tokenResponse.scope}\n`);

    // 만료 시간 계산
    const expiresAt = calculateTokenExpiry(tokenResponse.expires_in);
    console.log(`⏰ 만료 시간: ${expiresAt.toISOString()} (KST: ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})\n`);

    // AWS Secrets Manager에 저장
    console.log('💾 AWS Secrets Manager에 토큰 저장 중...');
    const secretsClient = new SecretsManagerClient({ region: 'ap-northeast-2' });

    // 기존 secret 값 가져오기
    const getCommand = new GetSecretValueCommand({
      SecretId: 'nasun-twitter-tokens'
    });
    const currentSecret = await secretsClient.send(getCommand);
    const currentValue = JSON.parse(currentSecret.SecretString || '{}');

    // OAuth2 섹션 업데이트 (OAuth 1.0a 토큰 유지)
    const updatedValue = {
      ...currentValue,
      oauth2: {
        clientId: config.oauth2ClientId,
        clientSecret: config.oauth2ClientSecret || '',
        userAccessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || '',
        expiresAt: expiresAt.getTime(),
        lastRefreshed: new Date().toISOString(),
        scope: tokenResponse.scope
      }
    };

    // Secret 업데이트
    const updateCommand = new UpdateSecretCommand({
      SecretId: 'nasun-twitter-tokens',
      SecretString: JSON.stringify(updatedValue, null, 2)
    });

    await secretsClient.send(updateCommand);
    console.log('✅ AWS Secrets Manager 업데이트 완료!\n');

    // 토큰을 로컬 파일에도 백업 저장
    fs.writeFileSync('/tmp/new-oauth-tokens.json', JSON.stringify({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: expiresAt.getTime(),
      expiresAtISO: expiresAt.toISOString(),
      scope: tokenResponse.scope,
      generatedAt: new Date().toISOString()
    }, null, 2));

    console.log('✅ 백업 저장 완료: /tmp/new-oauth-tokens.json\n');

    // 사용자 정보 확인 (토큰이 올바른 계정인지 검증)
    console.log('🔍 토큰 소유자 확인 중...');
    const meResponse = await fetch('https://api.x.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenResponse.access_token}`
      }
    });

    if (!meResponse.ok) {
      console.warn(`⚠️ 사용자 정보 조회 실패: ${meResponse.status} ${meResponse.statusText}`);
    } else {
      const meData = await meResponse.json();
      console.log('✅ 토큰 소유자 확인:');
      console.log(`   Username: @${meData.data.username}`);
      console.log(`   Name: ${meData.data.name}`);
      console.log(`   ID: ${meData.data.id}\n`);

      if (meData.data.username !== 'Naru010110') {
        console.warn('⚠️ 경고: 토큰이 @Naru010110 계정이 아닙니다!');
        console.warn('   본인 트윗의 Likes/Bookmarks 수집이 작동하지 않을 수 있습니다.\n');
      } else {
        console.log('✅ 올바른 타겟 계정으로 인증되었습니다! (@Naru010110)\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 OAuth 2.0 토큰 설정 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📝 다음 단계:');
    console.log('   1. 자동 토큰 갱신 Lambda 함수 작성 및 배포');
    console.log('   2. secure-token-manager.ts에 OAuth 2.0 우선 사용 로직 추가');
    console.log('   3. OAuth 2.0 토큰으로 API 테스트');
    console.log('   4. V3 파이프라인 통합 테스트\n');

    // 임시 파일 정리
    fs.unlinkSync(authDataPath);
    console.log('🧹 임시 파일 정리 완료 (/tmp/oauth-auth-data.json)\n');

  } catch (error: any) {
    console.error('❌ 토큰 교환 실패:', error.message);
    if (error.response) {
      console.error('   응답:', await error.response.text());
    }
    process.exit(1);
  }
}

main();
