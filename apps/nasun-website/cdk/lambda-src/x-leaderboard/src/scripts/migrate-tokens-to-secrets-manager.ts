/**
 * OAuth 2.0 토큰을 AWS Secrets Manager로 마이그레이션하는 스크립트
 * Phase 8: 보안 강화 - 환경변수에서 암호화 저장소로 이전
 */

import { SecureTokenManager, SecureTwitterTokens } from '../services/secure-token-manager';
import { getEnvConfigV2 } from '../utils/env';

class TokenMigrationScript {
  private secureTokenManager: SecureTokenManager;
  
  constructor() {
    this.secureTokenManager = new SecureTokenManager();
  }

  /**
   * 환경변수에서 토큰을 읽어 Secrets Manager로 마이그레이션
   */
  async migrateTokensFromEnv(): Promise<void> {
    console.log(`[MIGRATION] 🚀 OAuth 토큰 마이그레이션 시작`);
    
    try {
      // 1. 현재 환경변수에서 토큰 정보 읽기
      const envConfig = getEnvConfigV2();
      
      console.log(`[MIGRATION] 📖 환경변수에서 토큰 정보 읽는 중...`);
      console.log(`[MIGRATION] OAuth 1.0a 토큰 존재: ${!!(envConfig.twitterApiKey && envConfig.twitterApiSecret)}`);
      console.log(`[MIGRATION] OAuth 2.0 토큰 존재: ${!!(envConfig.oauth2ClientId && envConfig.oauth2ClientSecret)}`);
      
      // 2. 토큰 유효성 검증
      if (!this.validateEnvironmentTokens(envConfig)) {
        throw new Error('환경변수에서 필수 토큰을 찾을 수 없습니다');
      }
      
      // 3. Secrets Manager에 초기 시크릿 생성
      console.log(`[MIGRATION] 🔐 AWS Secrets Manager에 토큰 저장 중...`);
      await this.secureTokenManager.createInitialSecret(envConfig);
      
      // 4. 저장된 토큰 검증
      console.log(`[MIGRATION] ✅ 저장된 토큰 검증 중...`);
      const storedTokens = await this.secureTokenManager.getTokens();
      
      if (!this.validateStoredTokens(storedTokens)) {
        throw new Error('저장된 토큰 검증에 실패했습니다');
      }
      
      // 5. 토큰 상태 확인
      const tokenStatus = await this.secureTokenManager.validateTokenStatus();
      console.log(`[MIGRATION] 📊 토큰 상태:`, {
        oauth1Valid: tokenStatus.oauth1Valid,
        oauth2Valid: tokenStatus.oauth2Valid,
        oauth2Expired: tokenStatus.oauth2Expired,
        needsRefresh: tokenStatus.needsRefresh
      });
      
      console.log(`[MIGRATION] 🎉 마이그레이션 성공! 이제 환경변수 대신 Secrets Manager를 사용합니다.`);
      
      // 6. 마이그레이션 후 권고사항 표시
      this.displayPostMigrationGuide();
      
    } catch (error) {
      console.error(`[MIGRATION] ❌ 마이그레이션 실패:`, error);
      throw error;
    }
  }

  /**
   * 환경변수 토큰 유효성 검증
   */
  private validateEnvironmentTokens(envConfig: any): boolean {
    // OAuth 1.0a 필수 토큰 검증
    const oauth1Required = [
      envConfig.twitterApiKey,
      envConfig.twitterApiSecret,
      envConfig.twitterAccessToken,
      envConfig.twitterAccessTokenSecret,
      envConfig.twitterBearerToken
    ];

    const oauth1Valid = oauth1Required.every(token => token && token.length > 0);

    // OAuth 2.0 필수 토큰 검증
    const oauth2Required = [
      envConfig.oauth2ClientId,
      envConfig.oauth2ClientSecret,
      envConfig.oauth2RedirectUri
    ];

    const oauth2Valid = oauth2Required.every(token => token && token.length > 0);

    if (!oauth1Valid) {
      console.error(`[MIGRATION] ❌ OAuth 1.0a 토큰이 누락되었습니다`);
      return false;
    }

    if (!oauth2Valid) {
      console.error(`[MIGRATION] ❌ OAuth 2.0 토큰이 누락되었습니다`);
      return false;
    }

    return true;
  }

  /**
   * 저장된 토큰 유효성 검증
   */
  private validateStoredTokens(tokens: SecureTwitterTokens): boolean {
    try {
      // 기본 구조 검증
      if (!tokens.apiKey || !tokens.apiSecret || !tokens.accessToken) {
        console.error(`[MIGRATION] ❌ OAuth 1.0a 토큰이 누락됨`);
        return false;
      }

      if (!tokens.oauth2 || !tokens.oauth2.clientId || !tokens.oauth2.clientSecret) {
        console.error(`[MIGRATION] ❌ OAuth 2.0 토큰이 누락됨`);
        return false;
      }

      console.log(`[MIGRATION] ✅ 모든 토큰이 성공적으로 저장됨`);
      return true;

    } catch (error) {
      console.error(`[MIGRATION] ❌ 토큰 검증 실패:`, error);
      return false;
    }
  }

  /**
   * 마이그레이션 후 가이드 표시
   */
  private displayPostMigrationGuide(): void {
    console.log(`\n[MIGRATION] 📋 마이그레이션 완료 후 할 일:`);
    console.log(`  1. 🔧 Lambda 함수들이 Secrets Manager 접근 권한을 가지고 있는지 확인`);
    console.log(`  2. 🧪 새로운 토큰 시스템으로 API 호출 테스트 실행`);
    console.log(`  3. 📊 CloudWatch에서 토큰 관련 에러 로그 모니터링`);
    console.log(`  4. 🔄 OAuth 2.0 토큰 자동 갱신 스케줄 설정 확인`);
    console.log(`  5. ♻️  환경변수에서 토큰 제거 (백업 후)`);
    console.log(`\n[MIGRATION] ⚠️  주의사항:`);
    console.log(`  - 환경변수 토큰은 마이그레이션 완료 확인 후 제거하세요`);
    console.log(`  - Secrets Manager 권한이 없으면 fallback으로 환경변수 사용됩니다`);
    console.log(`  - 프로덕션 배포 전 충분한 테스트를 진행하세요`);
  }

  /**
   * 토큰 갱신 테스트
   */
  async testTokenRefresh(): Promise<boolean> {
    try {
      console.log(`[MIGRATION] 🔄 OAuth 2.0 토큰 갱신 테스트 중...`);
      
      const refreshedTokens = await this.secureTokenManager.refreshOAuth2Token();
      
      if (refreshedTokens.oauth2.userAccessToken) {
        console.log(`[MIGRATION] ✅ 토큰 갱신 성공`);
        return true;
      } else {
        console.log(`[MIGRATION] ❌ 토큰 갱신 실패 - 새 토큰이 없음`);
        return false;
      }
      
    } catch (error) {
      console.log(`[MIGRATION] ⚠️ 토큰 갱신 테스트 실패 (정상일 수 있음):`, (error as Error).message);
      return false;
    }
  }

  /**
   * 롤백 기능 - 환경변수로 되돌리기
   */
  async rollbackToEnvironmentVariables(): Promise<void> {
    try {
      console.log(`[MIGRATION] 🔙 환경변수로 롤백 중...`);
      
      // 캐시 클리어하여 환경변수 사용 강제
      this.secureTokenManager.clearCache();
      
      console.log(`[MIGRATION] ✅ 롤백 완료. 환경변수를 사용합니다.`);
      
    } catch (error) {
      console.error(`[MIGRATION] ❌ 롤백 실패:`, error);
      throw error;
    }
  }
}

// CLI 실행 지원
async function main() {
  const migration = new TokenMigrationScript();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      await migration.migrateTokensFromEnv();
      break;
      
    case 'test-refresh':
      await migration.testTokenRefresh();
      break;
      
    case 'rollback':
      await migration.rollbackToEnvironmentVariables();
      break;
      
    default:
      console.log(`사용법:`);
      console.log(`  pnpm tsx migrate-tokens-to-secrets-manager.ts migrate        # 토큰 마이그레이션`);
      console.log(`  pnpm tsx migrate-tokens-to-secrets-manager.ts test-refresh   # 토큰 갱신 테스트`);
      console.log(`  pnpm tsx migrate-tokens-to-secrets-manager.ts rollback       # 환경변수로 롤백`);
      process.exit(1);
  }
}

// 직접 실행된 경우에만 main 함수 호출
if (require.main === module) {
  main().catch(console.error);
}

export { TokenMigrationScript };