/**
 * AWS Secrets Manager 기반 보안 토큰 관리자
 * Phase 8: 보안 강화 - OAuth 2.0 토큰 암호화 저장
 */

import { 
  SecretsManagerClient, 
  GetSecretValueCommand,
  UpdateSecretCommand,
  CreateSecretCommand,
  DescribeSecretCommand 
} from '@aws-sdk/client-secrets-manager';
import { EnvConfigV2 } from '../utils/env';

// 보안 토큰 인터페이스
export interface SecureTwitterTokens {
  // OAuth 1.0a tokens
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken: string;
  
  // OAuth 2.0 tokens  
  oauth2: {
    clientId: string;
    clientSecret: string;
    userAccessToken?: string;
    refreshToken?: string;
    redirectUri: string;
    expiresAt?: number;
    scope: string[];
  };
  
  // 메타데이터
  lastUpdated: string;
  rotationSchedule?: string;
  version: string;
}

export class SecureTokenManager {
  private client: SecretsManagerClient; // Re-added
  private secretName: string;
  private region: string;
  private cache: SecureTwitterTokens | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

  constructor(region: string = 'ap-northeast-2') {
    this.region = region;
    this.client = new SecretsManagerClient({ region }); // Re-added
    // 환경 변수로 Secret 이름 지정, fallback은 기존 이름
    this.secretName = process.env.TWITTER_TOKENS_SECRET_NAME || 'nasun-twitter-tokens';
    console.log(`[SECURE_TOKEN] Using secret: ${this.secretName}`);
  }

  /**
   * 보안 토큰 조회
   */
  async getTokens(): Promise<SecureTwitterTokens> {
    try {
      // 캐시된 토큰이 유효한 경우 반환
      if (this.cache && Date.now() < this.cacheExpiry) {
        // OAuth 2.0 토큰 만료도 함께 확인
        const oauth2NotExpired = !this.cache.oauth2.expiresAt || this.cache.oauth2.expiresAt > Date.now();
        if (oauth2NotExpired) {
          console.log(`[SECURE_TOKEN] Using cached tokens`);
          return this.cache;
        }
        console.log(`[SECURE_TOKEN] ⚠️ OAuth 2.0 token expired, fetching fresh tokens`);
      }

      console.log(`[SECURE_TOKEN] Fetching tokens from Secrets Manager: ${this.secretName}`);
      
      const command = new GetSecretValueCommand({
        SecretId: this.secretName
      });
      
      const response = await this.client.send(command); // Use this.client
      
      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      const tokens = JSON.parse(response.SecretString) as SecureTwitterTokens;
      
      // 토큰 유효성 검증
      this.validateTokens(tokens);
      
      // 캐시 업데이트
      this.cache = tokens;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      
      console.log(`[SECURE_TOKEN] ✅ Tokens loaded successfully (OAuth2 expires: ${tokens.oauth2.expiresAt ? new Date(tokens.oauth2.expiresAt).toISOString() : 'N/A'})`);
      
      return tokens;
    } catch (error) {
      console.error(`[SECURE_TOKEN] ❌ Failed to get tokens:`, error);
      
      // Fallback to environment variables (임시)
      console.log(`[SECURE_TOKEN] 🔄 Falling back to environment variables`);
      return this.getFallbackTokensFromEnv();
    }
  }

  /**
   * OAuth 2.0 토큰 갱신
   */
  async refreshOAuth2Token(): Promise<SecureTwitterTokens> {
    try {
      const currentTokens = await this.getTokens();
      
      if (!currentTokens.oauth2.refreshToken) {
        throw new Error('No refresh token available');
      }

      console.log(`[SECURE_TOKEN] 🔄 Refreshing OAuth 2.0 access token`);
      
      // OAuth 2.0 토큰 갱신 API 호출
      const tokenResponse = await this.callTokenRefreshAPI(
        currentTokens.oauth2.refreshToken,
        currentTokens.oauth2.clientId,
        currentTokens.oauth2.clientSecret
      );

      // 새로운 토큰으로 업데이트
      const updatedTokens: SecureTwitterTokens = {
        ...currentTokens,
        oauth2: {
          ...currentTokens.oauth2,
          userAccessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token || currentTokens.oauth2.refreshToken,
          expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        },
        lastUpdated: new Date().toISOString(),
        version: '2.1'
      };

      // Secrets Manager에 업데이트
      await this.updateTokens(updatedTokens);
      
      console.log(`[SECURE_TOKEN] ✅ OAuth 2.0 token refreshed successfully`);
      
      return updatedTokens;
    } catch (error) {
      console.error(`[SECURE_TOKEN] ❌ Failed to refresh OAuth 2.0 token:`, error);
      throw error;
    }
  }

  /**
   * 토큰 업데이트 (Secrets Manager)
   */
  async updateTokens(tokens: SecureTwitterTokens): Promise<void> {
    try {
      const command = new UpdateSecretCommand({
        SecretId: this.secretName,
        SecretString: JSON.stringify(tokens, null, 2)
      });

      await this.client.send(command); // Use this.client
      
      // 캐시 무효화
      this.cache = null;
      this.cacheExpiry = 0;
      
      console.log(`[SECURE_TOKEN] ✅ Tokens updated in Secrets Manager`);
    } catch (error) {
      console.error(`[SECURE_TOKEN] ❌ Failed to update tokens:`, error);
      throw error;
    }
  }

  /**
   * 초기 시크릿 생성 (마이그레이션용)
   */
  async createInitialSecret(envConfig: EnvConfigV2): Promise<void> {
    try {
      const initialTokens: SecureTwitterTokens = {
        apiKey: envConfig.twitterApiKey,
        apiSecret: envConfig.twitterApiSecret,
        accessToken: envConfig.twitterAccessToken,
        accessTokenSecret: envConfig.twitterAccessTokenSecret,
        bearerToken: envConfig.twitterBearerToken,
        oauth2: {
          clientId: envConfig.oauth2ClientId,
          clientSecret: envConfig.oauth2ClientSecret,
          userAccessToken: envConfig.oauth2UserAccessToken,
          refreshToken: envConfig.oauth2RefreshToken,
          redirectUri: envConfig.oauth2RedirectUri,
          scope: ['bookmark.read', 'tweet.read', 'users.read'],
        },
        lastUpdated: new Date().toISOString(),
        version: '2.0'
      };

      const command = new CreateSecretCommand({
        Name: this.secretName,
        Description: 'NASUN Twitter OAuth tokens for bookmark scoring system',
        SecretString: JSON.stringify(initialTokens, null, 2),
        Tags: [
          { Key: 'Project', Value: 'NASUN' },
          { Key: 'Component', Value: 'BookmarkScoring' },
          { Key: 'Version', Value: 'v2' },
          { Key: 'Environment', Value: process.env.NODE_ENV || 'production' }
        ]
      });

      await this.client.send(command); // Use this.client
      console.log(`[SECURE_TOKEN] ✅ Initial secret created: ${this.secretName}`);
    } catch (error) {
      if ((error as any).name === 'ResourceExistsException') {
        console.log(`[SECURE_TOKEN] ℹ️  Secret already exists: ${this.secretName}`);
      } else {
        console.error(`[SECURE_TOKEN] ❌ Failed to create initial secret:`, error);
        throw error;
      }
    }
  }

  /**
   * 토큰 유효성 검증
   */
  private validateTokens(tokens: SecureTwitterTokens): void {
    const required = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret', 'bearerToken'];
    
    for (const field of required) {
      if (!(field in tokens) || !tokens[field as keyof SecureTwitterTokens]) {
        throw new Error(`Missing required token field: ${field}`);
      }
    }

    // OAuth 2.0 필수 필드 검증
    // Note: redirectUri는 초기 OAuth 인증 플로우에서만 필요하고,
    // 토큰 갱신 및 API 호출 시점에는 불필요하므로 필수 검증에서 제외
    const oauth2Required = ['clientId', 'clientSecret'];
    for (const field of oauth2Required) {
      if (!tokens.oauth2[field as keyof typeof tokens.oauth2]) {
        throw new Error(`Missing required OAuth 2.0 field: ${field}`);
      }
    }

    // 토큰 만료 확인
    if (tokens.oauth2.expiresAt && tokens.oauth2.expiresAt <= Date.now()) {
      console.log(`[SECURE_TOKEN] ⚠️ OAuth 2.0 token expired, refresh needed`);
    }
  }

  /**
   * OAuth 2.0 토큰 갱신 API 호출
   */
  private async callTokenRefreshAPI(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<any> {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  /**
   * 환경변수 기반 폴백 토큰 (임시)
   */
  private getFallbackTokensFromEnv(): SecureTwitterTokens {
    console.log(`[SECURE_TOKEN] ⚠️ Using fallback environment variables`);
    
    return {
      apiKey: process.env.TWITTER_API_KEY || '',
      apiSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
      bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
      oauth2: {
        clientId: process.env.OAUTH2_CLIENT_ID || '',
        clientSecret: process.env.OAUTH2_CLIENT_SECRET || '',
        userAccessToken: process.env.OAUTH2_USER_ACCESS_TOKEN,
        refreshToken: process.env.OAUTH2_REFRESH_TOKEN,
        redirectUri: process.env.OAUTH2_REDIRECT_URI || '',
        scope: ['bookmark.read', 'tweet.read', 'users.read'],
      },
      lastUpdated: new Date().toISOString(),
      version: '2.0-fallback'
    };
  }

  /**
   * 토큰 상태 검증
   */
  async validateTokenStatus(): Promise<{
    oauth1Valid: boolean;
    oauth2Valid: boolean;
    oauth2Expired: boolean;
    needsRefresh: boolean;
  }> {
    try {
      const tokens = await this.getTokens();
      
      const oauth1Valid = !!(tokens.apiKey && tokens.accessToken);
      const oauth2Valid = !!(tokens.oauth2.userAccessToken);
      const oauth2Expired = tokens.oauth2.expiresAt ? tokens.oauth2.expiresAt <= Date.now() : false;
      const needsRefresh = oauth2Expired && !!tokens.oauth2.refreshToken;
      
      return {
        oauth1Valid,
        oauth2Valid,
        oauth2Expired,
        needsRefresh
      };
    } catch (error) {
      console.error(`[SECURE_TOKEN] ❌ Token validation failed:`, error);
      return {
        oauth1Valid: false,
        oauth2Valid: false,
        oauth2Expired: true,
        needsRefresh: false
      };
    }
  }

  /**
   * 캐시 무효화
   */
  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
    console.log(`[SECURE_TOKEN] 🗑️ Token cache cleared`);
  }
}

// 싱글톤 인스턴스
export const secureTokenManager = new SecureTokenManager();