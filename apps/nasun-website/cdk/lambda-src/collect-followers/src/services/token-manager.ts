// Token manager for fetching OAuth 2.0 tokens from AWS Secrets Manager

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

export interface TwitterTokens {
  bearerToken: string;
  oauth2: {
    clientId: string;
    clientSecret: string;
    userAccessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export class TokenManager {
  private client: SecretsManagerClient;
  private secretName: string;
  private cache: TwitterTokens | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(region: string = 'ap-northeast-2') {
    this.client = new SecretsManagerClient({ region });
    this.secretName = process.env.TWITTER_TOKENS_SECRET_NAME || 'nasun-twitter-tokens';
    console.log(`[TOKEN_MANAGER] Using secret: ${this.secretName}`);
  }

  /**
   * Get OAuth 2.0 User Access Token from Secrets Manager
   */
  async getOAuth2Token(): Promise<string> {
    const tokens = await this.getTokens();

    if (!tokens.oauth2.userAccessToken) {
      throw new Error('OAuth 2.0 User Access Token not found in secrets');
    }

    // Check if token is expired
    if (tokens.oauth2.expiresAt && tokens.oauth2.expiresAt <= Date.now()) {
      console.log(`[TOKEN_MANAGER] ⚠️ OAuth 2.0 token expired, needs refresh`);
      // Note: Token refresh should be handled by a separate Lambda (refreshOAuth2Token)
      throw new Error('OAuth 2.0 token expired. Please run token refresh.');
    }

    return tokens.oauth2.userAccessToken;
  }

  /**
   * Get Bearer Token from Secrets Manager
   */
  async getBearerToken(): Promise<string> {
    const tokens = await this.getTokens();
    return tokens.bearerToken;
  }

  /**
   * Fetch tokens from Secrets Manager with caching
   */
  private async getTokens(): Promise<TwitterTokens> {
    // Return cached tokens if valid
    if (this.cache && Date.now() < this.cacheExpiry) {
      console.log(`[TOKEN_MANAGER] Using cached tokens`);
      return this.cache;
    }

    console.log(`[TOKEN_MANAGER] Fetching tokens from Secrets Manager`);

    try {
      const response = await this.client.send(
        new GetSecretValueCommand({
          SecretId: this.secretName,
        })
      );

      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      const secrets = JSON.parse(response.SecretString);

      const tokens: TwitterTokens = {
        bearerToken: secrets.bearerToken,
        oauth2: {
          clientId: secrets.oauth2?.clientId,
          clientSecret: secrets.oauth2?.clientSecret,
          userAccessToken: secrets.oauth2?.userAccessToken,
          refreshToken: secrets.oauth2?.refreshToken,
          expiresAt: secrets.oauth2?.expiresAt,
        },
      };

      // Update cache
      this.cache = tokens;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      console.log(`[TOKEN_MANAGER] ✅ Tokens loaded successfully`);
      return tokens;
    } catch (error) {
      console.error(`[TOKEN_MANAGER] Failed to get tokens from Secrets Manager:`, error);
      throw new Error('Secrets Manager unavailable. Check IAM permissions and secret name.');
    }
  }
}
