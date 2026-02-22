/**
 * Twitter OAuth 2.0 Token Refresh
 *
 * Self-contained module for refreshing Twitter OAuth 2.0 access tokens.
 * Ported from: apps/x-leaderboard-v2-legacy/cdk/lambda-src/x-leaderboard/src/utils/oauth2-helper.ts
 */

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * Refresh an OAuth 2.0 access token using a refresh token.
 * Uses Basic Auth (Base64 encoded client_id:client_secret) for confidential clients.
 */
export async function refreshAccessToken(
  config: OAuth2Config,
  refreshToken: string,
): Promise<OAuth2TokenResponse> {
  const tokenUrl = "https://api.x.com/2/oauth2/token";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.clientSecret) {
    const credentials = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as OAuth2TokenResponse;
}

/**
 * Convert expires_in (seconds) to absolute Date.
 */
export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
