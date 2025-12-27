/**
 * OAuth 2.0 Refresh Token을 사용하여 즉시 새 Access Token 발급
 *
 * 사용법:
 * cd <MONOREPO>/nasun-website/cdk
 * source .env
 * npx tsx refresh-token-now.ts
 */

import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function main() {
  console.log('🔄 OAuth 2.0 Refresh Token으로 새 Access Token 발급 중...\n');

  // 1. Secrets Manager에서 현재 토큰 가져오기
  const secretsClient = new SecretsManagerClient({ region: 'ap-northeast-2' });

  console.log('📥 Secrets Manager에서 토큰 조회 중...');
  const getSecretResponse = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: 'nasun-twitter-tokens-dev'
    })
  );

  const currentSecrets = JSON.parse(getSecretResponse.SecretString || '{}');
  const { oauth2 } = currentSecrets;

  if (!oauth2 || !oauth2.refreshToken) {
    console.error('❌ Refresh Token이 Secrets Manager에 없습니다!');
    process.exit(1);
  }

  console.log(`✅ Refresh Token 확인: ${oauth2.refreshToken.substring(0, 30)}...\n`);

  // 2. Client ID와 Secret 확인
  const clientId = oauth2.clientId;
  const clientSecret = oauth2.clientSecret;

  if (!clientId || !clientSecret) {
    console.error('❌ Client ID 또는 Client Secret이 없습니다!');
    process.exit(1);
  }

  console.log(`📋 Client ID: ${clientId}`);
  console.log(`📋 Client Secret: ${clientSecret.substring(0, 20)}...\n`);

  // 3. Refresh Token으로 새 Access Token 요청
  console.log('🔐 Twitter API에 새 Access Token 요청 중...');

  const tokenUrl = 'https://api.x.com/2/oauth2/token';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: oauth2.refreshToken,
    client_id: clientId
  });

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ 토큰 갱신 실패: ${response.status}`);
    console.error(`상세 오류: ${error}`);
    process.exit(1);
  }

  const newTokens: OAuth2TokenResponse = await response.json();

  console.log('\n✅ 새 Access Token 발급 성공!');
  console.log(`   Access Token: ${newTokens.access_token.substring(0, 40)}...`);
  console.log(`   Token Type: ${newTokens.token_type}`);
  console.log(`   Expires In: ${newTokens.expires_in} seconds (${Math.floor(newTokens.expires_in / 3600)} hours)`);
  console.log(`   Scope: ${newTokens.scope}`);

  if (newTokens.refresh_token) {
    console.log(`   New Refresh Token: ${newTokens.refresh_token.substring(0, 40)}... (갱신됨)`);
  } else {
    console.log(`   Refresh Token: 기존 유지`);
  }

  // 4. 만료 시간 계산
  const expiresAt = Date.now() + (newTokens.expires_in * 1000);
  const expiresAtDate = new Date(expiresAt);

  console.log(`\n⏰ 만료 시간:`);
  console.log(`   UTC: ${expiresAtDate.toISOString()}`);
  console.log(`   KST: ${expiresAtDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);

  // 5. Secrets Manager 업데이트
  console.log('\n💾 Secrets Manager 업데이트 중...');

  const updatedSecrets = {
    ...currentSecrets,
    oauth2: {
      ...oauth2,
      userAccessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || oauth2.refreshToken, // Rotation 대응
      expiresAt: expiresAt,
      lastRefreshed: new Date().toISOString(),
      scope: newTokens.scope
    }
  };

  await secretsClient.send(
    new UpdateSecretCommand({
      SecretId: 'nasun-twitter-tokens-dev',
      SecretString: JSON.stringify(updatedSecrets, null, 2)
    })
  );

  console.log('✅ Secrets Manager 업데이트 완료!');

  // 6. 사용자 확인
  console.log('\n🔍 토큰 소유자 확인 중...');

  const meResponse = await fetch('https://api.x.com/2/users/me', {
    headers: {
      'Authorization': `Bearer ${newTokens.access_token}`
    }
  });

  if (!meResponse.ok) {
    console.warn(`⚠️ 사용자 정보 조회 실패: ${meResponse.status}`);
  } else {
    const meData = await meResponse.json();
    console.log('✅ 토큰 소유자:');
    console.log(`   Username: @${meData.data.username}`);
    console.log(`   Name: ${meData.data.name}`);
    console.log(`   ID: ${meData.data.id}`);

    if (meData.data.username === 'Naru010110') {
      console.log('\n✅ 올바른 타겟 계정으로 인증되었습니다! (@Naru010110)');
    } else {
      console.warn('\n⚠️ 경고: 토큰이 @Naru010110 계정이 아닙니다!');
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 OAuth 2.0 토큰 갱신 완료!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📝 다음 단계:');
  console.log('   1. V3 파이프라인 테스트');
  console.log('   2. getTweetLikingUsers API 호출 확인');
  console.log('   3. 자동 갱신 시스템 배포\n');
}

main().catch(error => {
  console.error('\n❌ 오류 발생:', error);
  process.exit(1);
});
