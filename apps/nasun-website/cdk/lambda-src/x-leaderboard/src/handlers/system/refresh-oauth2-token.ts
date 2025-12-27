/**
 * 🔄 OAuth 2.0 Token Refresh Lambda Handler
 *
 * AWS Secrets Manager에 저장된 OAuth 2.0 토큰을 자동으로 갱신하는 Lambda 함수
 * EventBridge 스케줄로 매일 실행되어 토큰 만료를 방지
 *
 * @author Claude Code Assistant
 * @date 2025-10-04
 * @version 1.0
 */

import { Handler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { refreshAccessToken, isTokenExpired, calculateTokenExpiry } from '../../utils/oauth2-helper';
import { getEnvConfigV2 } from '../../utils/env';

interface RefreshTokenEvent {
  forceRefresh?: boolean; // 강제 갱신 플래그 (테스트용)
}

interface RefreshTokenResult {
  success: boolean;
  refreshed: boolean;
  message: string;
  tokenInfo?: {
    expiresAt: string;
    expiresAtISO: string;
    scope: string;
    lastRefreshed: string;
  };
  error?: string;
}

/**
 * 🔐 OAuth 2.0 Token Refresh Handler
 *
 * 동작 방식:
 * 1. Secrets Manager에서 현재 토큰 정보 조회
 * 2. 만료 시간 체크 (만료 60분 전부터 갱신 대상)
 * 3. Refresh Token으로 새 Access Token 발급
 * 4. 새 토큰 정보를 Secrets Manager에 저장
 *
 * 실행 트리거:
 * - EventBridge 스케줄: 90분마다 자동 실행 (24/7 background safety net)
 * - Step Functions Phase 0: 파이프라인 시작 시 체크 (self-sufficient)
 * - 수동 실행: 테스트 또는 긴급 갱신
 *
 * 이중 안전망 (2025-10-09 강화):
 * - 토큰 유효 시간: 120분
 * - EventBridge 주기: 90분
 * - 갱신 조건: 만료 60분 전
 * - 수학적 보장: 90분 후 실행 시 항상 30분 이하 남음 → 항상 갱신 트리거
 * - 파이프라인 독립성: isTokenExpired() 함수와 별도의 독립적인 검증 로직 사용
 *
 * Rate Limit:
 * - Twitter API: Refresh Token endpoint는 제한 없음
 */
export const handler: Handler<RefreshTokenEvent, RefreshTokenResult> = async (event) => {
  const startTime = Date.now();

  console.log('🔄 [REFRESH_OAUTH2_TOKEN] 시작:', JSON.stringify(event, null, 2));

  try {
    // AWS Secrets Manager 클라이언트 초기화
    const secretsClient = new SecretsManagerClient({ region: 'ap-northeast-2' });
    const cloudwatchClient = new CloudWatchClient({ region: 'ap-northeast-2' });

    // Secret ID 가져오기 (환경 변수에서 읽기)
    const secretId = process.env.TWITTER_TOKENS_SECRET_NAME || 'nasun-twitter-tokens';
    console.log(`🔑 [SECRET_ID] 사용할 Secret: ${secretId}`);

    // 현재 저장된 토큰 정보 조회
    console.log('📥 [SECRETS_MANAGER] 현재 토큰 정보 조회 중...');
    const getSecretResponse = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretId
      })
    );

    const currentValue = JSON.parse(getSecretResponse.SecretString || '{}');
    const { oauth2 } = currentValue;

    if (!oauth2 || !oauth2.refreshToken) {
      throw new Error('OAuth 2.0 Refresh Token이 Secrets Manager에 없습니다.');
    }

    console.log(`📋 [TOKEN_INFO] 현재 만료 시간: ${new Date(oauth2.expiresAt).toISOString()}`);
    console.log(`📋 [TOKEN_INFO] 현재 스코프: ${oauth2.scope || 'N/A'}`);

    // 토큰 만료 체크 (만료 60분 전부터 갱신 대상)
    // 파이프라인 독립성: isTokenExpired() 함수와 별도로 직접 계산하여 이중 안전망 구축
    const expiryDate = new Date(oauth2.expiresAt);
    const remainingMinutes = Math.floor((expiryDate.getTime() - Date.now()) / 1000 / 60);
    const needsRefresh = remainingMinutes <= 60 || event.forceRefresh;

    // 📊 CloudWatch 메트릭: 토큰 남은 시간 전송
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: 'NASUN/OAuth',
      MetricData: [{
        MetricName: 'TokenRemainingMinutes',
        Value: remainingMinutes,
        Unit: 'None',
        Timestamp: new Date()
      }]
    }));

    if (!needsRefresh && !event.forceRefresh) {
      console.log(`✅ [TOKEN_CHECK] 토큰이 아직 유효합니다 (남은 시간: ${remainingMinutes}분)`);
      return {
        success: true,
        refreshed: false,
        message: `토큰 갱신 불필요 (남은 시간: ${remainingMinutes}분)`,
        tokenInfo: {
          expiresAt: oauth2.expiresAt.toString(),
          expiresAtISO: expiryDate.toISOString(),
          scope: oauth2.scope,
          lastRefreshed: oauth2.lastRefreshed || 'N/A'
        }
      };
    }

    // ⚠️ CRITICAL SECTION: Refresh Token Rotation 안전 처리
    // Twitter OAuth 2.0는 Refresh Token Rotation을 지원합니다:
    // - 새 Access Token 발급 시 새 Refresh Token도 함께 발급 가능
    // - 이전 Refresh Token은 즉시 무효화됨 (Single Use Policy)
    // - Secrets Manager 업데이트 실패 시 복구 불가능!

    const oldRefreshToken = oauth2.refreshToken;  // 백업
    console.log('🔐 [REFRESH_TOKEN] 새 Access Token 발급 요청 중...');
    console.log(`   Old Refresh Token: ${oldRefreshToken.substring(0, 30)}...`);

    const config = getEnvConfigV2();
    let newTokenResponse;

    try {
      newTokenResponse = await refreshAccessToken(config, oldRefreshToken);
    } catch (error: any) {
      console.error('❌ [TWITTER_API] Refresh Token 사용 실패:', error.message);

      // Refresh Token이 이미 무효화되었을 가능성
      if (error.message.includes('invalid')) {
        console.error('🚨 [CRITICAL] Refresh Token이 무효화되었습니다!');
        console.error('🚨 [ACTION REQUIRED] 수동 OAuth 2.0 재인증 필요!');

        // CloudWatch Alarm 트리거
        await cloudwatchClient.send(new PutMetricDataCommand({
          Namespace: 'NASUN/OAuth',
          MetricData: [{
            MetricName: 'InvalidRefreshToken',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date()
          }]
        }));
      }

      throw error;  // 상위로 전파
    }

    console.log('✅ [TWITTER_API] 새 Access Token 발급 성공!');
    console.log(`   New Access Token: ${newTokenResponse.access_token.substring(0, 30)}...`);
    console.log(`   Expires In: ${newTokenResponse.expires_in} seconds (${Math.floor(newTokenResponse.expires_in / 3600)} hours)`);

    // Refresh Token Rotation 검증
    const hasRotation = newTokenResponse.refresh_token && newTokenResponse.refresh_token !== oldRefreshToken;
    if (hasRotation) {
      console.log('🔄 [ROTATION] Refresh Token Rotation 발생!');
      console.log(`   Old RT: ${oldRefreshToken.substring(0, 30)}...`);
      console.log(`   New RT: ${newTokenResponse.refresh_token!.substring(0, 30)}...`);
      console.log('⚠️  [WARNING] 이전 Refresh Token은 무효화되었습니다. Secrets Manager 업데이트 필수!');

      // CloudWatch 메트릭
      await cloudwatchClient.send(new PutMetricDataCommand({
        Namespace: 'NASUN/OAuth',
        MetricData: [{
          MetricName: 'RefreshTokenRotation',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date()
        }]
      }));
    } else {
      console.log('ℹ️  [NO_ROTATION] Refresh Token 재사용 (Rotation 없음)');
    }

    // 새 만료 시간 계산
    const newExpiresAt = calculateTokenExpiry(newTokenResponse.expires_in);
    console.log(`   New Expiry: ${newExpiresAt.toISOString()} (KST: ${newExpiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`);

    // ⚡ ATOMIC UPDATE: 즉시 Secrets Manager 업데이트 (최우선)
    console.log('💾 [SECRETS_MANAGER] 새 토큰 저장 중 (Retry 지원)...');
    const updatedValue = {
      ...currentValue,
      oauth2: {
        ...oauth2,
        userAccessToken: newTokenResponse.access_token,
        // Refresh Token Rotation 처리: 새 값이 있으면 사용, 없으면 기존 유지
        refreshToken: newTokenResponse.refresh_token || oauth2.refreshToken,
        expiresAt: newExpiresAt.getTime(),
        lastRefreshed: new Date().toISOString(),
        scope: newTokenResponse.scope
      }
    };

    // Retry Logic: Exponential Backoff (1s, 2s, 4s)
    let updateSuccess = false;
    let lastUpdateError: Error | null = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`   Attempt ${attempt}/5...`);

        await secretsClient.send(
          new UpdateSecretCommand({
            SecretId: secretId,
            SecretString: JSON.stringify(updatedValue, null, 2)
          })
        );

        updateSuccess = true;
        console.log(`✅ [SECRETS_MANAGER] 업데이트 성공 (Attempt ${attempt})!`);
        break;  // 성공 시 루프 탈출

      } catch (updateError: any) {
        lastUpdateError = updateError;
        console.error(`❌ [SECRETS_MANAGER] Attempt ${attempt}/5 실패:`, updateError.message);

        if (attempt < 5) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;  // 1s, 2s, 4s
          console.log(`   ⏳ ${backoffMs}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // 모든 재시도 실패 시 치명적 오류
    if (!updateSuccess) {
      console.error('🚨 [CRITICAL] Secrets Manager 업데이트 완전 실패!');
      console.error('🚨 [CRITICAL] Refresh Token이 무효화되었을 가능성 높음!');
      console.error('🚨 [ACTION REQUIRED] 즉시 수동 OAuth 2.0 재인증 필요!');

      // CloudWatch Alarm 트리거
      await cloudwatchClient.send(new PutMetricDataCommand({
        Namespace: 'NASUN/OAuth',
        MetricData: [{
          MetricName: 'SecretUpdateFailure',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date()
        }]
      }));

      throw new Error(`Secrets Manager 업데이트 실패 (3회 시도): ${lastUpdateError?.message}`);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [REFRESH_OAUTH2_TOKEN] 완료 (소요 시간: ${duration}ms)`);

    // 📊 CloudWatch 메트릭: 갱신 성공
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: 'NASUN/OAuth',
      MetricData: [{
        MetricName: 'TokenRefreshSuccess',
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date()
      }]
    }));

    return {
      success: true,
      refreshed: true,
      message: '토큰 갱신 성공',
      tokenInfo: {
        expiresAt: newExpiresAt.getTime().toString(),
        expiresAtISO: newExpiresAt.toISOString(),
        scope: newTokenResponse.scope,
        lastRefreshed: new Date().toISOString()
      }
    };

  } catch (error: any) {
    console.error('❌ [REFRESH_OAUTH2_TOKEN] 오류 발생:', error);

    // 📊 CloudWatch 메트릭: 갱신 실패
    try {
      const cloudwatchClient = new CloudWatchClient({ region: 'ap-northeast-2' });
      await cloudwatchClient.send(new PutMetricDataCommand({
        Namespace: 'NASUN/OAuth',
        MetricData: [{
          MetricName: 'TokenRefreshFailure',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date()
        }]
      }));
    } catch (metricError) {
      console.error('⚠️ [CLOUDWATCH] 메트릭 전송 실패:', metricError);
    }

    return {
      success: false,
      refreshed: false,
      message: '토큰 갱신 실패',
      error: error.message || '알 수 없는 오류'
    };
  }
};
