/**
 * OAuth 2.0 완전 자동화 설정 스크립트
 * - 로컬 HTTP 서버 자동 시작
 * - 브라우저 자동 열기
 * - Authorization Code 자동 수신 및 즉시 교환
 * - Secrets Manager 자동 업데이트
 *
 * 사용법:
 * cd <MONOREPO>/nasun-website/cdk
 * source .env
 * npx tsx setup-oauth2-auto.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';

dotenv.config({ path: path.resolve(__dirname, '.env') });

import { createAuthorizationRequest, exchangeCodeForToken, calculateTokenExpiry } from './lambda-src/x-leaderboard/src/utils/oauth2-helper';
import { getEnvConfigV2 } from './lambda-src/x-leaderboard/src/utils/env';
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

async function main() {
    const PORT = 5174; // 5175는 frontend가 사용 중
  const config = getEnvConfigV2();

  console.log('🚀 OAuth 2.0 완전 자동 설정 시작...\n');

  // 1. Authorization Request 생성
  const authRequest = createAuthorizationRequest(config);

  console.log('📋 OAuth 2.0 설정:');
  console.log(`   Client ID: ${config.oauth2ClientId}`);
  console.log(`   Redirect URI: ${config.oauth2RedirectUri}`);
  console.log(`   Scopes: tweet.read users.read bookmark.read offline.access\n`);

  console.log('🔗 브라우저에서 다음 URL을 열어주세요:\n');
  console.log(authRequest.authorizationUrl);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 2. 로컬 HTTP 서버 시작
    console.log(`\n[주의] 아래 주소는 브라우저에 입력하는 주소가 아닙니다. 스크립트가 내부적으로 사용하는 주소입니다.`);
    console.log(`[주의] 콜백 대기 서버: h_ttp://localhost:${PORT}/callback (내부용)\n`);
  console.log('👤 @Naru010110 계정으로 로그인하고 권한을 승인해주세요...\n');

  const server = http.createServer();

  const setupPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('인증 시간 초과 (5분)'));
    }, 5 * 60 * 1000);

    server.on('request', async (req, res) => {
      const parsedUrl = url.parse(req.url!, true);

      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.query.code as string;
        const returnedState = parsedUrl.query.state as string;

        // State 검증
        if (returnedState !== authRequest.state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>❌ State 검증 실패</h1><p>보안 오류가 발생했습니다.</p>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('State mismatch'));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>❌ Authorization Code 없음</h1>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('No authorization code'));
          return;
        }

        console.log('✅ Authorization Code 수신');
        console.log('🔄 즉시 Access Token으로 교환 중...\n');

        try {
          // 3. 즉시 토큰 교환 (만료 방지!)
          const tokens = await exchangeCodeForToken(config, code, authRequest.codeVerifier);

          console.log('✅ OAuth 2.0 토큰 발급 성공!');
          console.log(`   Access Token: ${tokens.access_token.substring(0, 40)}...`);
          console.log(`   Refresh Token: ${tokens.refresh_token?.substring(0, 40)}...`);
          console.log(`   Expires In: ${tokens.expires_in} seconds (${Math.floor(tokens.expires_in / 3600)} hours)`);
          console.log(`   Scope: ${tokens.scope}\n`);

          // 4. 만료 시간 계산
          const expiresAt = calculateTokenExpiry(tokens.expires_in);
          console.log(`⏰ 만료 시간: ${expiresAt.toISOString()} (KST: ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})\n`);

          // 5. Secrets Manager 업데이트
          console.log('💾 Secrets Manager 업데이트 중...');

          const secretsClient = new SecretsManagerClient({ region: 'ap-northeast-2' });

          const getSecretResponse = await secretsClient.send(
            new GetSecretValueCommand({ SecretId: 'nasun-twitter-tokens' })
          );

          const currentValue = JSON.parse(getSecretResponse.SecretString || '{}');

          const updatedValue = {
            ...currentValue,
            oauth2: {
              clientId: config.oauth2ClientId,
              clientSecret: config.oauth2ClientSecret,
              userAccessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || '',
              redirectUri: config.oauth2RedirectUri,
              expiresAt: expiresAt.getTime(),
              lastRefreshed: new Date().toISOString(),
              scope: tokens.scope
            }
          };

          await secretsClient.send(
            new UpdateSecretCommand({
              SecretId: 'nasun-twitter-tokens',
              SecretString: JSON.stringify(updatedValue, null, 2)
            })
          );

          console.log('✅ Secrets Manager 업데이트 완료!\n');

          // 6. 사용자 확인
          console.log('🔍 토큰 소유자 확인 중...');

          const meResponse = await fetch('https://api.x.com/2/users/me', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
          });

          let username = 'Unknown';
          let name = 'Unknown';

          if (meResponse.ok) {
            const meData = await meResponse.json();
            username = meData.data.username;
            name = meData.data.name;

            console.log(`✅ 토큰 소유자: @${username} (${name})\n`);

            if (username !== 'Naru010110') {
              console.warn('⚠️ 경고: 토큰이 @Naru010110 계정이 아닙니다!');
            }
          }

          // 7. 성공 페이지 표시
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>OAuth 2.0 인증 성공</title>
                <style>
                  body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
                  h1 { color: #1DA1F2; }
                  .success { background: #E8F5E9; padding: 15px; border-radius: 8px; }
                  .info { background: #E3F2FD; padding: 15px; border-radius: 8px; margin-top: 15px; }
                  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
                </style>
              </head>
              <body>
                <h1>✅ OAuth 2.0 인증 성공!</h1>
                <div class="success">
                  <p><strong>사용자:</strong> @${username} (${name})</p>
                  <p><strong>Access Token:</strong> 발급 완료</p>
                  <p><strong>Refresh Token:</strong> 발급 완료</p>
                  <p><strong>만료 시간:</strong> ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                </div>
                <div class="info">
                  <p><strong>다음 단계:</strong></p>
                  <ul>
                    <li>이 창을 닫아도 됩니다</li>
                    <li>OAuth 2.0 토큰이 AWS Secrets Manager에 저장되었습니다</li>
                    <li>자동 갱신 시스템을 배포할 수 있습니다</li>
                  </ul>
                </div>
              </body>
            </html>
          `);

          clearTimeout(timeout);
          setTimeout(() => server.close(), 1000);

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🎉 OAuth 2.0 설정 완료!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

          resolve();

        } catch (error: any) {
          console.error('\n❌ 토큰 교환 실패:', error.message);

          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>토큰 교환 실패</title></head>
              <body>
                <h1>❌ 토큰 교환 실패</h1>
                <p>${error.message}</p>
                <p>터미널에서 에러 로그를 확인해주세요.</p>
              </body>
            </html>
          `);

          clearTimeout(timeout);
          setTimeout(() => server.close(), 1000);
          reject(error);
        }
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`⏳ Authorization Code 대기 중... (최대 5분)\n`);
  });

  await setupPromise;
}

main().catch(error => {
  console.error('\n❌ 설정 실패:', error.message);
  process.exit(1);
});
